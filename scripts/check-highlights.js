#!/usr/bin/env node
/* Checks highlighting: the colours, the marks, the clearing, and the export.
   Run with:

     node scripts/check-highlights.js */
"use strict";

const path = require("path");
const H = require(path.join(__dirname, "..", "js", "highlights.js"));

const failures = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

/* ---------- the colours ---------- */

check("there are a few colours, not a paintbox", H.COLOURS.length >= 3 && H.COLOURS.length <= 6,
  String(H.COLOURS.length));
check("every colour has a name and a meaning for the reader",
  H.COLOURS.every(function (c) { return c.id && c.label && c.note; }));
check("the colour ids are lowercase words",
  H.COLOURS.every(function (c) { return /^[a-z]+$/.test(c.id); }));
check("a known colour is known", H.isColour("gold") && !!H.colour("blue"));
check("an unknown colour is not", !H.isColour("chartreuse") && H.colour("gold") !== null);

/* ---------- keys ---------- */

check("a mark is keyed by verse", H.key("john", 3, 16) === "john.3.16", H.key("john", 3, 16));
check("a mark's key reads back",
  JSON.stringify(H.parseKey("i-kings.2.11")) === JSON.stringify({ slug: "i-kings", chapter: 2, verse: 11 }));
check("a mark without a verse is not a mark", H.parseKey("john.3") === null && H.parseKey("john") === null);

/* ---------- marking ---------- */

let marks = {};
marks = H.put(marks, H.key("john", 3, 16), "gold", "2026-09-20T10:00:00.000Z");
check("a verse is marked in a colour", H.colourAt(marks, "john", 3, 16) === "gold");
check("one mark is one mark", H.count(marks) === 1);
check("a verse with no mark has no colour", H.colourAt(marks, "john", 3, 17) === null);

marks = H.put(marks, H.key("john", 3, 16), "blue");
check("remarking a verse changes its colour rather than adding a second",
  H.count(marks) === 1 && H.colourAt(marks, "john", 3, 16) === "blue");

marks = H.put(marks, H.key("john", 3, 16), null);
check("an unknown colour clears the mark", H.count(marks) === 0, JSON.stringify(marks));

marks = H.put(marks, H.key("genesis", 1, 1), "gold", "2026-09-20T09:00:00.000Z");
marks = H.put(marks, H.key("genesis", 1, 26), "rose", "2026-09-20T11:00:00.000Z");
marks = H.put(marks, H.key("psalms", 23, 1), "green", "2026-09-20T10:00:00.000Z");
check("three marks are three marks", H.count(marks) === 3);

check("clearing by hand removes one", H.count(H.clear(marks, "genesis.1.1")) === 2);
check("clearing does not touch the others",
  H.colourAt(H.clear(marks, "genesis.1.1"), "psalms", 23, 1) === "green");

/* Writers hand back new objects, like the note store. */
const before = JSON.stringify(marks);
H.put(marks, H.key("ruth", 1, 16), "gold");
H.clear(marks, "john.3.16");
check("marking does not change the store it was handed", JSON.stringify(marks) === before);

/* ---------- reading them back ---------- */

const chapter = H.forChapter(marks, "genesis", 1);
check("a chapter's marks come back by verse",
  Object.keys(chapter).sort().join(",") === "1,26" && chapter["1"] === "gold", JSON.stringify(chapter));
check("another chapter has none", H.count(H.forChapter(marks, "genesis", 2)) === 0);

check("scripture order is scripture order",
  H.list(marks, ["genesis", "psalms", "john"]).map(function (r) { return r.slug; }).join(",") ===
  "genesis,genesis,psalms",
  H.list(marks, ["genesis", "psalms", "john"]).map(function (r) { return r.slug; }).join(","));
check("newest first is newest first",
  H.list(marks).map(function (r) { return r.chapter + ":" + r.verse; }).join(",") === "1:26,23:1,1:1",
  H.list(marks).map(function (r) { return r.chapter + ":" + r.verse; }).join(","));

const tally = H.byColour(marks);
check("the colours are counted", tally.gold === 1 && tally.rose === 1 && tally.green === 1 && tally.blue === 0,
  JSON.stringify(tally));

/* ---------- the export ---------- */

const md = H.toMarkdown(marks, {
  names: { genesis: "Genesis", psalms: "Psalms", john: "John" },
  order: ["genesis", "psalms", "john"],
  verses: function (slug, chapter, verse) {
    return slug === "psalms" && chapter === 23 ? "The LORD is my shepherd." : null;
  }
});
check("the export is headed as highlights", md.indexOf("## Highlighted verses") === 0, md.slice(0, 40));
check("the export groups by book", md.indexOf("### Genesis") > -1 && md.indexOf("### Psalms") > -1);
check("the export records the colour",
  md.indexOf("- **1:1** _gold_") > -1 && md.indexOf("- **1:26** _rose_") > -1, md);
check("the export can quote the verse", md.indexOf("_green_ \u2014 The LORD is my shepherd.") > -1, md);
check("an empty set of marks exports as nothing", H.toMarkdown({}, {}) === "");

/* ---------- report ---------- */

if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the highlight colours, marking, clearing, reading back and export; all checks passed");
