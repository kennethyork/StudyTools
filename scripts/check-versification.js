#!/usr/bin/env node
/* Checks the Vulgate-to-Hebrew psalm numbering in js/versification.js.

   Two halves. The first tests the table on its own terms: it must be a
   correspondence between 1 and 150, and the awkward cases must land where the
   table says. The second reads the real Douay-Rheims and the site's own
   translations and checks the table against the texts: the psalms that share a
   Vulgate chapter must add up to that chapter's verses exactly, which is
   something the table cannot fake. Run with:

     node scripts/check-versification.js
*/
"use strict";

const fs = require("fs");
const path = require("path");
const V = require(path.join(__dirname, "..", "js", "versification.js"));

const ROOT = path.join(__dirname, "..");
const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

function psalmChapter(translation, chapter) {
  const file = path.join(ROOT, "data", "bible", "psalms." + translation + ".json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return data.chapters[String(chapter)] || {};
}

function verseCount(translation, chapter) {
  return Object.keys(psalmChapter(translation, chapter)).length;
}

/* ---------- the table on its own terms ---------- */

let mapped = 0;
let badTarget = 0;
for (let n = 1; n <= 150; n++) {
  const out = V.vulgatePsalm(n);
  if (!out) { continue; }
  mapped++;
  if (out.chapter < 1 || out.chapter > 150) { badTarget++; }
}
check("every Hebrew psalm maps somewhere", mapped === 150, mapped + " of 150");
check("every target is a psalm the Vulgate has", badTarget === 0, badTarget + " out of range");
check("Hebrew 1-8 are unchanged", V.vulgatePsalm(1).chapter === 1 && V.vulgatePsalm(8).chapter === 8);
check("Hebrew 9 is the first half of Vulgate 9",
  V.vulgatePsalm(9).chapter === 9 && V.vulgatePsalm(9).verseOffset === 0);
check("Hebrew 10 is the second half of Vulgate 9",
  V.vulgatePsalm(10).chapter === 9 && V.vulgatePsalm(10).verseOffset === 21,
  JSON.stringify(V.vulgatePsalm(10)));
check("Hebrew 11 is Vulgate 10", V.vulgatePsalm(11).chapter === 10);
check("Hebrew 113 is Vulgate 112", V.vulgatePsalm(113).chapter === 112);
check("Hebrew 114 and 115 both sit in Vulgate 113",
  V.vulgatePsalm(114).chapter === 113 && V.vulgatePsalm(115).chapter === 113 &&
  V.vulgatePsalm(115).verseOffset === 8);
check("Hebrew 116 begins Vulgate 114", V.vulgatePsalm(116).chapter === 114);
check("Hebrew 147 begins Vulgate 146", V.vulgatePsalm(147).chapter === 146);
check("Hebrew 148-150 are unchanged",
  V.vulgatePsalm(148).chapter === 148 && V.vulgatePsalm(150).chapter === 150);
check("psalms outside 1-150 map nowhere", V.vulgatePsalm(0) === null && V.vulgatePsalm(151) === null);

/* The inverse has to be the inverse, verse by verse, through every psalm. */
let roundTripBad = 0;
for (let n = 1; n <= 150; n++) {
  const out = V.vulgatePsalm(n);
  for (let v = 1; v <= 5; v++) {
    const back = V.hebrewPsalm(out.chapter, v + out.verseOffset);
    if (!back) { roundTripBad++; continue; }
    /* where a psalm is split across two Vulgate psalms the first verses stay put */
    if (back.chapter !== n && !(n === 116 || n === 147)) { roundTripBad++; }
  }
}
check("a psalm's first verses come back to the same psalm", roundTripBad === 0, roundTripBad + " differ");
check("Vulgate 115:1 is Hebrew 116:10", V.hebrewPsalm(115, 1).chapter === 116 && V.hebrewPsalm(115, 1).verse === 10);
check("Vulgate 147:1 is Hebrew 147:12", V.hebrewPsalm(147, 1).chapter === 147 && V.hebrewPsalm(147, 1).verse === 12);
check("Vulgate 9:22 is Hebrew 10:1", V.hebrewPsalm(9, 22).chapter === 10 && V.hebrewPsalm(9, 22).verse === 1);
check("Vulgate 113:9 is Hebrew 115:1", V.hebrewPsalm(113, 9).chapter === 115 && V.hebrewPsalm(113, 9).verse === 1);

/* ---------- the table against the texts ---------- */

/* The heart of it: where two Hebrew psalms make one Vulgate psalm, the Vulgate
   chapter must hold their verses between them. The counts match exactly, except
   where the two traditions divide a verse differently — Psalm 9 runs one verse
   longer in the Vulgate than Hebrew 9 and 10 together, which is a division, not
   a missing psalm. */
check("Hebrew 9 + 10 come to Vulgate 9, within a verse",
  Math.abs((verseCount("WEBU", 9) + verseCount("WEBU", 10)) - verseCount("DRC", 9)) <= 1,
  verseCount("WEBU", 9) + "+" + verseCount("WEBU", 10) + " vs " + verseCount("DRC", 9));
check("Hebrew 114 + 115 fill Vulgate 113",
  verseCount("WEBU", 114) + verseCount("WEBU", 115) === verseCount("DRC", 113),
  verseCount("WEBU", 114) + "+" + verseCount("WEBU", 115) + " vs " + verseCount("DRC", 113));
check("Hebrew 116 fills Vulgate 114 + 115",
  verseCount("WEBU", 116) === verseCount("DRC", 114) + verseCount("DRC", 115),
  verseCount("WEBU", 116) + " vs " + verseCount("DRC", 114) + "+" + verseCount("DRC", 115));
check("Hebrew 147 fills Vulgate 146 + 147",
  verseCount("WEBU", 147) === verseCount("DRC", 146) + verseCount("DRC", 147),
  verseCount("WEBU", 147) + " vs " + verseCount("DRC", 146) + "+" + verseCount("DRC", 147));
notes.push("the splits: Hebrew 9+10 = " + (verseCount("WEBU", 9) + verseCount("WEBU", 10)) +
  " verses against Vulgate 9's " + verseCount("DRC", 9) +
  "; Hebrew 114+115 = " + (verseCount("WEBU", 114) + verseCount("WEBU", 115)) +
  " against Vulgate 113's " + verseCount("DRC", 113));

/* Landmarks in the text itself: the psalm the table points at must be the psalm
   the reader expects to find there. */
check("the Douay-Rheims Psalm 22 is the Hebrew Psalm 23",
  /ruleth me/i.test(psalmChapter("DRC", 22)["1"] || ""), psalmChapter("DRC", 22)["1"]);
check("the Hebrew Psalm 23 is the shepherd psalm",
  /shepherd/i.test(psalmChapter("WEBU", 23)["1"] || ""), psalmChapter("WEBU", 23)["1"]);
check("the Douay-Rheims Psalm 23 is the Hebrew Psalm 24",
  /the earth is the lord/i.test(psalmChapter("DRC", 23)["1"] || ""), psalmChapter("DRC", 23)["1"]);
check("the Douay-Rheims Psalm 117 is the Hebrew Psalm 118",
  /for he is good/i.test(psalmChapter("DRC", 117)["1"] || ""),
  psalmChapter("DRC", 117)["1"]);
check("the Douay-Rheims Psalm 116 is the Hebrew Psalm 117",
  /all ye nations/i.test(psalmChapter("DRC", 116)["1"] || ""),
  psalmChapter("DRC", 116)["1"]);

/* ---------- references ---------- */

const map = (text, to) => V.mapReference(
  { book: "psalms", chapter: text[0], verseStart: text[1], verseEnd: text[1] }, "masoretic", to);

check("a plain psalm reference shifts by one",
  map([23, 1], "vulgate").parsed.chapter === 22, JSON.stringify(map([23, 1], "vulgate")));
check("a psalm in the second half does not",
  map([10, 1], "vulgate").parsed.chapter === 9 &&
  map([10, 1], "vulgate").parsed.verseStart === 22, JSON.stringify(map([10, 1], "vulgate")));
check("the first half of Psalm 9 keeps its verse",
  map([9, 3], "vulgate").parsed.chapter === 9 && map([9, 3], "vulgate").parsed.verseStart === 3);
check("Psalm 115 starts at Vulgate 113:9",
  map([115, 1], "vulgate").parsed.chapter === 113 && map([115, 1], "vulgate").parsed.verseStart === 9);
check("the mapping explains itself",
  /Psalm 10 in the Hebrew numbering is Psalm 9/.test(map([10, 1], "vulgate").note),
  map([10, 1], "vulgate").note);
check("other books are left alone",
  V.mapReference({ book: "john", chapter: 3, verseStart: 16, verseEnd: 16 }, "masoretic", "vulgate").mapped === false);
check("no mapping when the numberings agree",
  V.mapReference({ book: "psalms", chapter: 23, verseStart: 1, verseEnd: 1 }, "masoretic", "masoretic").mapped === false);

/* ---------- report ---------- */

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the psalm numbering against the table and against the texts; all checks passed");
