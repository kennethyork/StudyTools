#!/usr/bin/env node
/* Checks the data-carrying rules in js/data.js: what is collected, how two
   devices' copies are brought together, and that a sync code survives the round
   trip. Run with:

     node scripts/check-yourdata.js

   The merge is the part worth testing: it is the difference between two devices
   adding up and one of them losing a year of reading. */
"use strict";

const path = require("path");
const D = require(path.join(__dirname, "..", "js", "data.js"));

const failures = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

/* Deep equality that does not care what order the keys were written in: the
   merge sorts its keys, the fixtures do not. */
function same(a, b) {
  function canon(v) {
    if (Array.isArray(v)) { return v.map(canon); }
    if (v && typeof v === "object") {
      var out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = canon(v[k]); });
      return out;
    }
    return v;
  }
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/* ---------- what is collected ---------- */

const store = {
  "studytools.verse-notes.v1": JSON.stringify({ "john.3.16": { text: "love", updated: "2026-01-01" } }),
  "studytools.reading-plan.v1": JSON.stringify({ id: "bible", start: "2026-01-01", done: { "2026-01-01": true } }),
  "studytools.theme": JSON.stringify("dark"),
  "unrelated.thing": JSON.stringify({ nope: true }),
  "studytools.sermon-notebook.v1": "not json"
};
const collected = D.collect(store);
check("the site's own keys are collected",
  !!collected["verse-notes.v1"] && !!collected["reading-plan.v1"]);
check("a display preference is not data to carry", collected.theme === undefined);
check("someone else's keys are left alone", collected["unrelated.thing"] === undefined);
check("a value that is not ours to parse is skipped", collected["sermon-notebook.v1"] === undefined);

/* ---------- merging ---------- */

const local = {
  "verse-notes.v1": {
    "john.3.16": { text: "mine, older", updated: "2026-01-01T00:00:00.000Z" },
    "psalms.23.1": { text: "only here", updated: "2026-02-01T00:00:00.000Z" }
  },
  "reading-plan.v1": { id: "bible", start: "2026-01-01", tr: "WEBU", done: { "2026-01-01": true, "2026-01-02": true } },
  "memory-deck.v1": [{ ref: "John 3:16", reps: 5, text: "a" }, { ref: "Psalms 23:1", reps: 0, text: "b" }],
  "vocab-progress.v1": { H0430: true, G26: false },
  "sermon-notebook.v1": { body: "the local notebook" }
};
const incoming = {
  "verse-notes.v1": {
    "john.3.16": { text: "theirs, newer", updated: "2026-03-01T00:00:00.000Z" },
    "genesis.1.1": { text: "only there", updated: "2026-01-15T00:00:00.000Z" }
  },
  "reading-plan.v1": { id: "bible", start: "2026-01-01", tr: "ASV", done: { "2026-01-02": true, "2026-01-03": true } },
  "memory-deck.v1": [{ ref: "John 3:16", reps: 2, text: "a" }, { ref: "Romans 5:8", reps: 1, text: "c" }],
  "vocab-progress.v1": { H0430: true, H0853: true },
  "sermon-notebook.v1": { body: "the incoming notebook" }
};

const merged = D.merge(local, incoming);
const m = merged.data;

check("a note changed more recently wins",
  m["verse-notes.v1"]["john.3.16"].text === "theirs, newer", JSON.stringify(m["verse-notes.v1"]["john.3.16"]));
check("a note only one side had is kept",
  !!m["verse-notes.v1"]["genesis.1.1"] && !!m["verse-notes.v1"]["psalms.23.1"]);
check("notes from both sides are all present",
  Object.keys(m["verse-notes.v1"]).sort().join(",") === "genesis.1.1,john.3.16,psalms.23.1",
  Object.keys(m["verse-notes.v1"]).join(","));

check("days read are added together, not replaced",
  Object.keys(m["reading-plan.v1"].done).sort().join(",") === "2026-01-01,2026-01-02,2026-01-03",
  Object.keys(m["reading-plan.v1"].done).join(","));
check("the plan's own settings are kept",
  m["reading-plan.v1"].tr === "WEBU" && m["reading-plan.v1"].id === "bible");

check("memory cards are brought together", m["memory-deck.v1"].length === 3, String(m["memory-deck.v1"].length));
check("the card further along keeps its schedule",
  m["memory-deck.v1"].filter(function (c) { return c.ref === "John 3:16"; })[0].reps === 5);
check("a card only one side had is added",
  m["memory-deck.v1"].some(function (c) { return c.ref === "Romans 5:8" && c.reps === 1; }));

check("a word known on either side stays known", m["vocab-progress.v1"].H0853 === true);
check("a word marked unknown here and known there is left alone",
  m["vocab-progress.v1"].G26 === false);

check("a key that cannot be merged safely keeps this device's copy, and says so",
  m["sermon-notebook.v1"].body === "the local notebook" &&
  merged.report.filter(function (r) { return r.key === "sermon-notebook.v1"; })[0].action === "conflict",
  JSON.stringify(merged.report.filter(function (r) { return r.key === "sermon-notebook.v1"; })));
check("the report covers every key it touched",
  merged.report.length === Object.keys(m).length,
  merged.report.length + " report rows for " + Object.keys(m).length + " keys");
check("the report names what happened per key",
  merged.report.every(function (r) { return r.key && r.action && r.note; }));

check("merging with nothing on the other side changes nothing",
  same(D.merge(local, {}).data, local), JSON.stringify(D.merge(local, {}).data).slice(0, 80));
check("merging into nothing is just importing",
  same(D.merge({}, incoming).data, incoming));
check("merging a copy with itself is a no-op",
  same(D.merge(local, local).data, local));

/* ---------- the summary ---------- */

check("the summary counts what matters",
  D.summary(m).notes === 3 && D.summary(m).ticks === 3 && D.summary(m).deck === 3, JSON.stringify(D.summary(m)));
check("the summary reads as a sentence",
  /3 verse notes/.test(D.describe(m)) && /3 days ticked/.test(D.describe(m)), D.describe(m));
check("an empty store describes itself honestly", D.describe({}) === "nothing saved yet", D.describe({}));

/* ---------- the code ---------- */

const payload = { "verse-notes.v1": { "john.3.16": { text: "love", updated: "2026-01-01" } } };
D.toCode(payload).then(function (code) {
  check("the code is text, not a blob", typeof code === "string" && code.length > 10, String(code).slice(0, 40));
  check("the code says how it was packed", /^(z|plain):/.test(code), String(code).slice(0, 8));
  return D.fromCode(code).then(function (back) {
    check("a code survives the round trip", same(back, payload), JSON.stringify(back));
  });
}).then(function () {
  return D.fromCode("nonsense").then(function () {
    check("a bad code does not resolve", false);
  }, function (err) {
    check("a bad code fails with something a reader can read",
      /does not look like a sync code/i.test(err.message), err.message);
  });
}).then(function () {
  check("a code can be read out of a link",
    D.codeFromHash("#d=" + encodeURIComponent("z:abc-_")) === "z:abc-_", String(D.codeFromHash("#d=z:abc-_")));
  check("a link with no code yields nothing", D.codeFromHash("#other=1") === null);
}).then(function () {
  if (failures.length) {
    failures.forEach(function (f) { console.log("FAIL: " + f); });
    console.log(failures.length + " failure(s)");
    process.exit(1);
  }
  console.log("checked collection, the merge of two devices' reading, and the sync code; all checks passed");
}).catch(function (err) {
  console.log("FAIL: the checks threw — " + err.message);
  process.exit(1);
});
