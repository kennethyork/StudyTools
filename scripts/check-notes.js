#!/usr/bin/env node
/* Checks verse notes: the keys, the store rules, the ordering and the Markdown
   export. Run with:

     node scripts/check-notes.js

   js/notes.js is pure functions over a plain object, so this needs nothing but
   node. */
"use strict";

const path = require("path");
const N = require(path.join(__dirname, "..", "js", "notes.js"));

const failures = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

/* ---------- keys ---------- */

check("a key is book, chapter and verse", N.key("genesis", 1, 1) === "genesis.1.1", N.key("genesis", 1, 1));
check("a key takes strings or numbers", N.key("psalms", "23", "1") === "psalms.23.1", N.key("psalms", "23", "1"));

/* ---------- notes on a chapter, and on a book ---------- */

check("a chapter note has no verse", N.key("genesis", 1) === "genesis.1", N.key("genesis", 1));
check("a verse of 0 means the chapter", N.key("genesis", 1, 0) === "genesis.1", N.key("genesis", 1, 0));
check("a book note is the slug alone", N.key("genesis") === "genesis", N.key("genesis"));
check("a chapter key reads back with no verse",
  JSON.stringify(N.parseKey("genesis.1")) === JSON.stringify({ slug: "genesis", chapter: 1, verse: null }),
  JSON.stringify(N.parseKey("genesis.1")));
check("a book key reads back with neither",
  JSON.stringify(N.parseKey("genesis")) === JSON.stringify({ slug: "genesis", chapter: null, verse: null }),
  JSON.stringify(N.parseKey("genesis")));
check("the level of a note is named",
  N.levelOf("john.3.16") === "verse" && N.levelOf("john.3") === "chapter" &&
  N.levelOf("john") === "book",
  [N.levelOf("john.3.16"), N.levelOf("john.3"), N.levelOf("john")].join("/"));

let mixed = {};
mixed = N.put(mixed, N.key("genesis"), "the book as a whole", "2026-09-20T08:00:00.000Z");
mixed = N.put(mixed, N.key("genesis", 1), "the chapter", "2026-09-20T09:00:00.000Z");
mixed = N.put(mixed, N.key("genesis", 1, 1), "the first verse", "2026-09-20T10:00:00.000Z");
check("a book, a chapter and a verse note live side by side", N.count(mixed) === 3, String(N.count(mixed)));
check("the chapter note is found by the chapter",
  N.chapterNote(mixed, "genesis", 1).text === "the chapter", JSON.stringify(N.chapterNote(mixed, "genesis", 1)));
check("the book note is found by the book", N.bookNote(mixed, "genesis").text === "the book as a whole");
check("the chapter's verse notes do not include the chapter note itself",
  Object.keys(N.forChapter(mixed, "genesis", 1)).join(",") === "1",
  Object.keys(N.forChapter(mixed, "genesis", 1)).join(","));
check("another chapter has no note", N.chapterNote(mixed, "genesis", 2) === null);
check("scripture order puts the book first, then the chapter, then its verses",
  N.byScripture(mixed, ["genesis"]).map(function (n) { return n.level; }).join(",") ===
  "book,chapter,verse",
  N.byScripture(mixed, ["genesis"]).map(function (n) { return n.level; }).join(","));
check("each note knows what it is about",
  N.byScripture(mixed, ["genesis"]).every(function (n) { return n.level === N.levelOf(n.key); }));

const mdMixed = N.toMarkdown(mixed, { names: { genesis: "Genesis" }, order: ["genesis"] });
check("the export says which note is on the book", mdMixed.indexOf("_On the book:_ the book as a whole") > -1, mdMixed);
check("the export says which note is on the chapter", mdMixed.indexOf("_On the chapter:_ the chapter") > -1);
check("the export still lists the verse note as a verse", mdMixed.indexOf("- **1:1** the first verse") > -1);
check("labels name a chapter and a book without inventing a verse",
  N.label("genesis", 1, null, { genesis: "Genesis" }) === "Genesis 1" &&
  N.label("genesis", null, null, { genesis: "Genesis" }) === "Genesis");
check("a key reads back", JSON.stringify(N.parseKey("i-kings.2.11")) ===
  JSON.stringify({ slug: "i-kings", chapter: 2, verse: 11 }));
check("a book name on its own is a book note, not a malformed key",
  N.parseKey("nonsense") !== null && N.levelOf("nonsense") === "book");
check("a malformed key reads back as nothing",
  N.parseKey("a.b.c.d") === null && N.parseKey("genesis.0") === null && N.parseKey("") === null,
  JSON.stringify([N.parseKey("a.b.c.d"), N.parseKey("genesis.0"), N.parseKey("")]));

/* ---------- the store ---------- */

let notes = {};
notes = N.put(notes, N.key("john", 3, 16), "  Love that does not wait to be loved.  ", "2026-09-20T10:00:00.000Z");
check("a note is stored trimmed", N.get(notes, "john.3.16").text === "Love that does not wait to be loved.",
  JSON.stringify(N.get(notes, "john.3.16")));
check("a note remembers when it changed", N.get(notes, "john.3.16").updated === "2026-09-20T10:00:00.000Z");
check("one note is one note", N.count(notes) === 1);

notes = N.put(notes, N.key("john", 3, 16), "Rewritten.");
check("writing again replaces rather than adds", N.count(notes) === 1 && N.get(notes, "john.3.16").text === "Rewritten.");

notes = N.put(notes, N.key("john", 3, 16), "   ");
check("emptying a note removes it", N.count(notes) === 0, JSON.stringify(notes));

notes = N.put(notes, N.key("genesis", 1, 1), "In the beginning.", "2026-09-20T09:00:00.000Z");
notes = N.put(notes, N.key("genesis", 1, 2), "Formless and empty.", "2026-09-20T11:00:00.000Z");
notes = N.put(notes, N.key("psalms", 23, 1), "The Lord is my shepherd.", "2026-09-20T10:00:00.000Z");
check("three notes are three notes", N.count(notes) === 3);

check("a chapter's notes come out by verse",
  Object.keys(N.forChapter(notes, "genesis", 1)).sort().join(",") === "1,2");
check("another chapter has none", N.count(N.forChapter(notes, "genesis", 2)) === 0);
check("another book has none", N.count(N.forChapter(notes, "john", 3)) === 0);
check("a verse without a note gives an empty string", N.textFor(notes, "genesis", 1, 3) === "");

check("removing a note leaves the rest", N.count(N.remove(notes, "genesis.1.1")) === 2);

/* ---------- ordering ---------- */

check("newest change comes first", N.byUpdated(notes).map(function (n) { return n.key; }).join(",") ===
  "genesis.1.2,psalms.23.1,genesis.1.1", N.byUpdated(notes).map(function (n) { return n.key; }).join(","));
check("scripture order ignores when it was written",
  N.byScripture(notes, ["genesis", "psalms", "john"]).map(function (n) { return n.key; }).join(",") ===
  "genesis.1.1,genesis.1.2,psalms.23.1",
  N.byScripture(notes, ["genesis", "psalms", "john"]).map(function (n) { return n.key; }).join(","));
check("a book the order does not know sorts last",
  N.byScripture(notes, ["psalms"]).map(function (n) { return n.slug; }).join(",") === "psalms,genesis,genesis",
  N.byScripture(notes, ["psalms"]).map(function (n) { return n.slug; }).join(","));

/* ---------- the Markdown export ---------- */

const md = N.toMarkdown(notes, {
  names: { genesis: "Genesis", psalms: "Psalms" },
  order: ["genesis", "psalms"],
  date: "20 September 2026",
  verses: function (slug, chapter, verse) {
    return slug === "genesis" && chapter === 1 && verse === 1 ? "In the beginning, God created the heavens and the earth." : null;
  }
});
check("the export has a title and a count", md.indexOf("# Verse notes") === 0 && md.indexOf("3 notes") > -1);
check("the export groups by book and chapter",
  md.indexOf("## Genesis") > -1 && md.indexOf("### Genesis 1") > -1 && md.indexOf("## Psalms") > -1);
check("the export lists a note under its verse",
  md.indexOf("- **1:1** In the beginning.") > -1, md);
check("the export can quote the verse itself",
  md.indexOf("> In the beginning, God created the heavens and the earth.") > -1);
check("the export puts Genesis before Psalms", md.indexOf("## Genesis") < md.indexOf("## Psalms"));
check("an empty store exports as nothing rather than an empty heading", N.toMarkdown({}, {}) === "");

check("a multi-line note stays on one line in the export",
  N.toMarkdown(N.put({}, "john.3.16", "first line\nsecond line"), {}).indexOf("- **3:16** first line second line") > -1);

/* ---------- report ---------- */

if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the note keys, store rules, ordering and Markdown export; all checks passed");
