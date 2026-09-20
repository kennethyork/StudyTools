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
check("a key reads back", JSON.stringify(N.parseKey("i-kings.2.11")) ===
  JSON.stringify({ slug: "i-kings", chapter: 2, verse: 11 }));
check("a malformed key reads back as nothing", N.parseKey("nonsense") === null && N.parseKey("") === null);

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
