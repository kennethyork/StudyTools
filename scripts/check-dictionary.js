#!/usr/bin/env node
/* Checks the Bible dictionary data: five sources merged into one alphabetical
   dictionary, and the things that go wrong when a dictionary is built by machine
   rather than typed.

   The failure this guards is silence. The dictionary is scraped and abridged: a
   row read one field too far gives a definition that belongs to another word, a
   stray tag or a `Â` sits in the middle of a sentence, an entry arrives with no
   source to cite, and the page still renders — it simply lies. The check that
   matters most is the one about "lasciviousness": a word a reader of the King
   James Version would look up has to be there, and has to be about that word,
   because its absence is how this whole source came to be added.

   Run with:

     node scripts/check-dictionary.js
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "dictionary");

const failures = [];
const notes = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}
function load(rel) { return JSON.parse(fs.readFileSync(path.join(DIR, rel), "utf8")); }

const index = load("index.json");
const letters = Object.keys(index.letters || {}).sort();

/* ---------- the index ---------- */

const WANTED = [
  ["Easton's Bible Dictionary", 1897],
  ["Smith's Bible Dictionary", 1863],
  ["Hastings' Dictionary of the Bible", 1909],
  ["Hitchcock's Bible Names", 1869],
  ["Webster's 1828 Dictionary", 1828],
  ["This site's own note", 2026]
];
check("the index names its sources",
  Array.isArray(index.sources) && index.sources.length === WANTED.length,
  (index.sources || []).map(function (s) { return s.label; }).join(", "));
const missing = WANTED.filter(function (pair) {
  return !(index.sources || []).some(function (s) { return s.label === pair[0] && s.year === pair[1]; });
});
check("and they are the five the app claims, with their years", missing.length === 0,
  missing.map(function (p) { return p.join(" "); }).join(", "));
check("every letter from a to z is indexed",
  letters.join("") === "abcdefghijklmnopqrstuvwxyz", letters.join(""));
const counted = letters.reduce(function (n, letter) { return n + index.letters[letter].length; }, 0);
check("the index's total is the number of terms it lists", counted === index.total,
  counted + " against " + index.total);
notes.push(index.total.toLocaleString() + " terms from " + index.sources.length + " sources");

/* ---------- the entries ---------- */

const byLabel = {};
(index.sources || []).forEach(function (s) { byLabel[s.label] = s.year; });

let definitions = 0;
const problems = {
  unnamed: [], badSlug: [], empty: [], tagged: [], mojibake: [], uncited: [], mislabelled: [],
  long: [], placeholderText: []
};
const words = {};

letters.forEach(function (letter) {
  const file = load(letter + ".json");
  check(letter + ".json is the letter it says it is", file.letter === letter, String(file.letter));
  const slugs = {};
  (file.entries || []).forEach(function (entry) {
    const where = letter + "/" + (entry.slug || entry.name || "?");
    if (!(entry.definitions || []).length) { problems.empty.push(where + " (no definitions)"); }
    if (!entry.name) { problems.unnamed.push(where); }
    /* a name the scraper left behind: the 1828 dump fills the heading of a row it
       could not find with "&nbsp; No results found." or "Did you mean one of these
       words?", and both reached the page as entries a reader could click */
    else if (/&[a-z]+;|no results? found|did you mean/i.test(entry.name)) {
      problems.unnamed.push(where + " [" + entry.name + "]");
    }
    if (!entry.slug || !/^[a-z0-9-]+$/.test(entry.slug)) { problems.badSlug.push(where); }
    if (slugs[entry.slug]) { problems.badSlug.push(where + " (twice in one letter)"); }
    slugs[entry.slug] = true;
    (entry.definitions || []).forEach(function (def) {
      definitions++;
      const text = String(def.text || "");
      if (!text.trim()) { problems.empty.push(where); return; }
      if (/<[a-z/][^>]*>/i.test(text)) { problems.tagged.push(where); }
      /* the 1828 dump keeps the scrape's own failure notice where it found no
         definition; it reads like an entry until a reader opens one */
      if (/please check your spelling|no results? found|for further assistance|did you mean/i.test(text)) {
        problems.placeholderText.push(where + " [" + text.slice(0, 40) + "]");
      }
      /* the 1828 dump arrives with non-breaking spaces decoded as two characters,
         and with the HTML entities the source used */
      if (text.indexOf("\u00c2") !== -1 || /&(?:amp|nbsp|quot|#39);/.test(text)) {
        problems.mojibake.push(where);
      }
      /* Only the abridgment is capped. Hastings writes essays — "Bible" runs to
         63,000 characters and that is the work, not a fault — but a 1828 entry
         longer than its cap means the dump was read out of step and two entries
         have been run together. */
      if (def.sourceLabel === "Webster's 1828 Dictionary" && text.length > 2100) {
        problems.long.push(where + " " + text.length);
      }
      if (!def.source || !def.sourceLabel) { problems.uncited.push(where); }
      else if (!(def.sourceLabel in byLabel) || byLabel[def.sourceLabel] !== def.year) {
        problems.mislabelled.push(where + " [" + def.sourceLabel + " " + def.year + "]");
      }
      if (def.sourceLabel === "Webster's 1828 Dictionary") { words[entry.slug] = true; }
    });
  });
});
check("every definition can cite a source the index lists",
  problems.uncited.length === 0 && problems.mislabelled.length === 0,
  problems.uncited.concat(problems.mislabelled).slice(0, 3).join(", "));
check("no definition carries markup", problems.tagged.length === 0,
  problems.tagged.slice(0, 3).join(", "));
check("no definition carries the dump's mis-read characters", problems.mojibake.length === 0,
  problems.mojibake.slice(0, 3).join(", "));
check("no term is left with a scraper's placeholder for a name",
  problems.unnamed.length === 0, problems.unnamed.slice(0, 3).join(", "));
check("and no definition is one either", problems.placeholderText.length === 0,
  problems.placeholderText.slice(0, 3).join(", "));
check("no term is empty, unnamed or badly slugged",
  problems.empty.length + problems.unnamed.length + problems.badSlug.length === 0,
  problems.empty.concat(problems.unnamed, problems.badSlug).slice(0, 3).join(", "));
check("no 1828 entry ran past the length the abridgment caps it at",
  problems.long.length === 0, problems.long.slice(0, 3).join(", "));
notes.push(definitions.toLocaleString() + " definitions checked");

/* ---------- the word dictionary, which is why it is here ---------- */

/* A KJV word the three Bible dictionaries have nothing on: Easton, Smith and
   Hastings are about people, places and subjects, and this one is about words. */
const las = load("l.json").entries.filter(function (e) { return e.slug === "lasciviousness"; })[0];
check("a KJV word the Bible dictionaries have nothing on is defined here", !!las,
  "lasciviousness is not in the dictionary");
if (las) {
  const from = las.definitions.map(function (d) { return d.sourceLabel; });
  check("and it is Webster's 1828 that defines it", from.indexOf("Webster's 1828 Dictionary") !== -1,
    from.join(", "));
  const text = las.definitions.map(function (d) { return d.text; }).join(" ");
  check("with the sense the King James uses, and its citation",
    /Looseness/.test(text) && /Ephesians/.test(text), text.slice(0, 80));
}
check("the word dictionary is a real share of the whole",
  Object.keys(words).length > 5000, Object.keys(words).length + " headwords");
/* A headword the King James only ever uses in an inflected form. "Acclamation"
   occurs in it as "acclamations" and "abhor" as "abhorrest" and "abhorreth", so a
   filter that asked whether the headword itself appears in the text threw both
   entries away and the reader who looked one up found nothing. */
check("a headword the King James only uses inflected is still defined",
  words.acclamation && words.abhor, ["acclamation", "abhor"]
    .filter(function (w) { return !words[w]; }).join(", ") + " missing");
check("and the words of the King James' own front matter are not in it",
  !words.afternoon && !words.alfred && !words.anything,
  ["afternoon", "alfred", "anything"].filter(function (w) { return words[w]; }).join(", "));
check("and it holds the ordinary words of the King James, not only the names",
  ["conversation", "charity", "kingdom", "hope"].every(function (w) { return words[w]; }),
  ["conversation", "charity", "kingdom", "hope"].filter(function (w) { return !words[w]; }).join(", "));
/* The whole of Webster's 1828 ships — 60,968 entries, most of them about things no
   Bible reader looks up — so the words the King James uses are marked in the index
   and put first in a letter's list. That mark is what is checked: a word of the
   King James must carry it, and a word the King James never uses must not. */
const marked = load("index.json").letters;
let flagged = 0;
const flaggedSlugs = {};
Object.keys(marked).forEach(function (letter) {
  flagged += marked[letter].filter(function (e) { return e.kjv; }).length;
  marked[letter].forEach(function (e) { if (e.kjv) { flaggedSlugs[e.slug] = true; } });
});
check("the words of the King James are marked in the index",
  flagged > 5000 && flaggedSlugs.lasciviousness && flaggedSlugs.meek,
  flagged + " marked" + ["lasciviousness", "meek"].filter(function (w) { return !flaggedSlugs[w]; })
    .map(function (w) { return "; " + w + " not among them"; }).join(""));
check("and the rest of the dictionary is not marked",
  !!index.letters.s.filter(function (e) { return e.slug === "saxifrage"; }).length &&
  !flaggedSlugs.steam && !flaggedSlugs.locomotive && !flaggedSlugs.saxifrage,
  ["steam", "locomotive", "saxifrage"].filter(function (w) { return flaggedSlugs[w]; }).join(", ") +
  " wrongly marked");

/* ---------- the notes written by hand ----------

   These are this site's own writing, which makes them the only part of the
   dictionary nobody else has checked. Each one says where the word is read, so
   each citation is checked here against the text: the verse has to exist, and it
   has to contain the word the note is about. A note that cites the wrong verse, or
   a verse that does not say the thing, fails.

   The books are the reader's own (data/bible/books.json), and the text is the
   modernized King James, which keeps the King James' words. */
const BOOKS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "bible", "books.json"), "utf8"));
const byName = {};
BOOKS.forEach(function (b) {
  byName[b.name.toLowerCase()] = b;
  byName[b.slug] = b;
});
if (byName.psalms) { byName.psalm = byName.psalms; }
const verseCache = {};
function verseOf(slug, chapter, verse) {
  const key = slug + "." + chapter;
  if (!(key in verseCache)) {
    verseCache[key] = null;
    ["KJVM", "WEBU"].forEach(function (tr) {
      const file = path.join(ROOT, "data", "bible", slug + "." + tr + ".json");
      if (verseCache[key] || !fs.existsSync(file)) { return; }
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        verseCache[key] = ((data.chapters || {})[String(chapter)]) || {};
      } catch (e) { /* unreadable: treated as absent */ }
    });
  }
  return verseCache[key] ? verseCache[key][String(verse)] : undefined;
}

/* The word as the note's entry has it, and the forms a verse might use. Both
   sides are reduced the same way — the spelling differences between the King
   James and the modernized text it is checked against — so that licence is found
   in license, skilful in skillful, publick in public, and a verse quoted around
   the word is quoted around the word. */
function foldSpelling(text) {
  return String(text).toLowerCase()
    .replace(/our/g, "or")
    .replace(/ck/g, "c")
    .replace(/ll/g, "l")
    .replace(/ise/g, "ize")
    .replace(/ce\b/g, "se")
    .replace(/[^a-z]/g, "");
}
function wordForms(slug) {
  const parts = slug.replace(/-/g, " ");
  const forms = [slug.replace(/-/g, ""), slug.replace(/men$/, "man"), slug.replace(/s$/, "")];
  return forms.concat(parts.split(" ")).concat(parts.split(" ").map(function (p) { return p + "s"; }));
}

/* The book names the reader has, longest first, so a citation is read as "Song of
   Solomon 8:14" and not as "Solomon", and a word sitting in front of a book name
   ("Bason Psalm 26:6") is not taken for one. Parentheses are escaped: a book
   called "Esther (Greek)" would otherwise put a capturing group in the pattern and
   shift the groups the numbers are read from. */
const BOOK_WORDS = BOOKS.map(function (b) { return b.name; })
  .concat(Object.keys(byName).filter(function (k) { return /^[a-z0-9-]+$/.test(k); }))
  .concat(["Psalm", "Psalms", "Song of Solomon", "Canticles", "Bel"])
  .filter(function (n, i, all) { return all.indexOf(n) === i; })
  .sort(function (a, b) { return b.length - a.length; })
  .map(function (n) {
    return n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[- ]?");
  });
const CITATION = new RegExp("(" + BOOK_WORDS.join("|") + ")\\s+(\\d+):(\\d+)", "gi");
const handNotes = [];
letters.forEach(function (letter) {
  load(letter + ".json").entries.forEach(function (entry) {
    entry.definitions.forEach(function (def) {
      if (def.sourceLabel !== "This site's own note") { return; }
      handNotes.push({ slug: entry.slug, name: entry.name, text: def.text });
    });
  });
});
check("the hand-written notes are in the dictionary", handNotes.length >= 50, handNotes.length + " notes");
const uncited = [], badBook = [], wrongVerse = [];
handNotes.forEach(function (note) {
  const finder = new RegExp(CITATION.source, "gi");
  const found = String(note.text).match(finder) || [];
  if (!found.length) { uncited.push(note.name); return; }
  const forms = wordForms(note.slug);
  let proved = false;
  found.forEach(function (ref) {
    const parts = new RegExp(CITATION.source, "i").exec(ref);
    if (!parts) { return; }
    const book = byName[parts[1].trim().toLowerCase().replace(/[-]/g, " ")] ||
      byName[parts[1].trim().toLowerCase().replace(/[- ]/g, "-")];
    if (!book) { badBook.push(note.name + " " + ref); return; }
    const verse = verseOf(book.slug, parts[2], parts[3]);
    if (process.env.DBG) { console.log("CITE " + ref + " book=" + book.slug + " ch=" + parts[2] + " v=" + parts[3] + " -> " + (verse === undefined ? "MISSING" : String(verse).slice(0, 40))); }
    if (verse === undefined) { wrongVerse.push(note.name + " " + ref + " (no such verse)"); return; }
    const flat = foldSpelling(verse);
    const says = forms.some(function (form) {
      const f = foldSpelling(form);
      if (f.length < 4) { return false; }
      if (flat.indexOf(f) !== -1) { return true; }
      /* the same name spelled the modern way: Azarias for Azariah */
      return flat.indexOf(f.slice(0, 6)) !== -1;
    });
    if (says) { proved = true; } else if (!proved) { wrongVerse.push(note.name + " " + ref); }
  });
  if (proved) {
    for (let i = wrongVerse.length - 1; i >= 0 && wrongVerse[i].indexOf(note.name + " ") === 0; i--) {
      wrongVerse.splice(i, 1);      /* another citation of the same note did check out */
    }
  }
});
check("every note says where the word is read", uncited.length === 0, uncited.join(", "));
check("and cites books the reader has", badBook.length === 0, badBook.slice(0, 3).join("; "));
check("and cites verses that contain the word", wrongVerse.length === 0,
  wrongVerse.slice(0, 40).join("; "));


/* Hitchcock's contribution: what a name means. */
const aaron = load("a.json").entries.filter(function (e) { return e.slug === "aaron"; })[0];
check("a Bible name is given its meaning as well as its history",
  !!aaron && aaron.definitions.some(function (d) {
    return d.sourceLabel === "Hitchcock's Bible Names" && /teacher|lofty/i.test(d.text);
  }), aaron ? aaron.definitions.map(function (d) { return d.sourceLabel; }).join(", ") : "no entry");

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the dictionary: six sources, and the words the King James uses");
