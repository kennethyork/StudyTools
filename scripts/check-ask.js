#!/usr/bin/env node
/* Checks the local-model side of the reader: what the model is told, which
   model is picked, and that the streaming path works. Run with:

     node scripts/check-ask.js

   None of this needs a GPU or a download: js/ask.js is pure functions plus a
   stub engine, and this exercises both. What it cannot check is the model
   itself — that is done on a machine with WebGPU. */
"use strict";

const path = require("path");
const A = require(path.join(__dirname, "..", "js", "ask.js"));

const failures = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

/* ---------- which model, and whether it can run ---------- */

check("Llama 3.2 3B is the default", A.MODELS[0].id === "Llama-3.2-3B-Instruct-q4f16_1-MLC", A.MODELS[0].id);
check("the default sizes are stated", /GB/.test(A.MODELS[0].size), A.MODELS[0].size);
check("every model has a name, a size and a note",
  A.MODELS.every(function (m) { return m.id && m.label && m.size && m.note; }));
check("a browser without WebGPU reports that, and detect() resolves false",
  typeof navigator === "undefined" ? A.hasWebGPU() === false : true);

/* pickModel keeps a wrong id from being a hard failure */
check("the preferred model is used when the library has it",
  A.pickModel([{ model_id: "Llama-3.2-1B-Instruct-q4f16_1-MLC" },
               { model_id: "Llama-3.2-3B-Instruct-q4f16_1-MLC" }]) === "Llama-3.2-3B-Instruct-q4f16_1-MLC");
check("another offered size is used when the first is missing",
  A.pickModel([{ model_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" }]) === "Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
check("failing that, something three-billion-ish",
  A.pickModel([{ model_id: "Phi-3.5-mini-instruct-q4f16_1-MLC" }]) === "Phi-3.5-mini-instruct-q4f16_1-MLC");
check("an empty list still yields the preferred id", A.pickModel([]) === A.MODELS[0].id);
check("plain strings are accepted as a model list", A.pickModel(["Llama-3.2-3B-Instruct-q4f16_1-MLC"]) ===
  "Llama-3.2-3B-Instruct-q4f16_1-MLC");

/* ---------- what the model is told ---------- */

const context = {
  label: "John 3:16",
  translations: [
    { name: "World English Bible, Updated", text: "For God so loved the world, that he gave his only born Son." },
    { name: "Douay-Rheims", text: "For God so loved the world, as to give his only begotten Son." }
  ],
  references: [{ ref: "Romans 5:8", votes: 871 }, { ref: "1 John 4:9-10", votes: 618 }],
  words: [{ g: "\u1f20\u03b3\u03ac\u03c0\u03b7\u03c3\u03b5\u03bd", t: "e\u0304gape\u0304sen", e: "to love" }],
  readings: ["TRINITY SUNDAY \u00b7 Sunday \u00b7 morning second lesson"]
};
const block = A.contextBlock(context);
check("the passage is named", block.indexOf("John 3:16") > -1);
check("every translation is given to the model",
  block.indexOf("World English Bible, Updated: For God so loved") > -1 && block.indexOf("Douay-Rheims:") > -1);
check("the cross-references are given, with their votes",
  block.indexOf("Romans 5:8 (871 votes)") > -1);
check("the original words are given, with their transliteration and gloss",
  block.indexOf("to love") > -1 && block.indexOf(context.words[0].t) > -1 &&
  block.indexOf(context.words[0].g) > -1, block.split("\n").filter(function (l) { return l.indexOf("love") > -1; })[0]);
check("where the Prayer Book reads it is given", block.indexOf("TRINITY SUNDAY") > -1);
check("an empty context says so rather than pretending",
  A.contextBlock({ label: "Obadiah 1" }).indexOf("no translation text was available") > -1);
check("no section is headed when it has nothing in it",
  A.contextBlock({ label: "X", translations: [{ name: "T", text: "y" }] }).indexOf("Cross-references") === -1);

const messages = A.buildMessages(context, "What does \u201cworld\u201d mean here?");
const system = messages[0].content;
check("there is a system turn and a user turn", messages.length === 2 &&
  messages[0].role === "system" && messages[1].role === "user");
check("the instructions forbid inventing quotations and references",
  /never invent/i.test(system) && /quote only the translations listed/i.test(system));
check("the instructions ask it to cite", /cite the references/i.test(system));
check("the instructions cover not knowing", /does not answer the question/i.test(system));

/* ---------- the instructions think in Bible terms ---------- */

check("it reads a passage as the kind of writing it is",
  /kind of writing it is/i.test(system) && /narrative/i.test(system));
check("narrative is not treated as command", /it is not a command/i.test(system));
check("poetry and prophecy are not read flat", /hyperbole/i.test(system));
check("letters are read as addressed to particular situations", /particular situations/i.test(system));
check("apocalyptic is named for what it is", /apocalyptic/i.test(system));
check("the canon is kept in view", /two testaments/i.test(system) && /shape of the canon/i.test(system));
check("tradition is separated from the text", /what a tradition reads into it/i.test(system));
check("a Jewish reading is not silently merged into a Christian one",
  /jewish reading differs/i.test(system));
check("it is told not to preach, moralise or speak as God",
  /do not preach/i.test(system) && /do not speak as God/i.test(system));
check("it is told not to direct the reader's own life", /reader's own life/i.test(system));
check("it is told to be brief", /be brief/i.test(system));

/* ---------- the modes ---------- */

check("there are several ways of asking", A.MODES.length >= 4, String(A.MODES.length));
check("every mode has a name, a question and an instruction",
  A.MODES.every(function (m) { return m.id && m.label && m.question && m.instruction; }));
check("mode ids are unique",
  new Set(A.MODES.map(function (m) { return m.id; })).size === A.MODES.length);
check("an unknown mode falls back to the shared rules",
  A.buildMessages(context, "q", "nonsense")[0].content === A.SYSTEM);
check("the own-question mode adds nothing",
  A.buildMessages(context, "q", "own")[0].content === A.SYSTEM);

const byId = {};
A.MODES.forEach(function (m) { byId[m.id] = m; });
check("the plain-sense mode is about what the text says and how the translations differ",
  /kind of writing/i.test(byId.plain.instruction) && /translations supplied differ/i.test(byId.plain.instruction));
check("the story mode uses the cross-references", /cross-references supplied/i.test(byId.story.instruction));
check("the words mode is restricted to the words supplied", /only the words supplied/i.test(byId.words.instruction));
check("the church mode refuses to invent a reading", /if none are supplied, say so/i.test(byId.church.instruction));
check("the teaching mode forbids writing a sermon", /do not write a sermon/i.test(byId.teach.instruction));

const taught = A.buildMessages(context, "How would I teach this?", "teach");
check("a mode's instruction joins the shared rules",
  taught[0].content.indexOf(A.SYSTEM) === 0 && /do not write a sermon/i.test(taught[0].content));
check("the question is carried through", messages[1].content.indexOf("What does \u201cworld\u201d mean here?") > -1);

/* ---------- the thread ---------- */

const thread = [
  { role: "user", content: A.contextBlock(context) + "\n\nQuestion: What does this say?" },
  { role: "assistant", content: "It says that God loved the world." },
  { role: "user", content: "And what does \u201cworld\u201d mean?" }
];
const followed = A.buildMessages(context, "", "plain", thread);
check("a follow-up keeps the question and both answers in the thread",
  followed.length === 4 && followed[0].role === "system" &&
  followed[3].content === "And what does \u201cworld\u201d mean?", JSON.stringify(followed.map(function (m) { return m.role; })));
check("only the first turn carries the material",
  followed.filter(function (m) { return m.content.indexOf("871 votes") > -1; }).length === 1,
  String(followed.filter(function (m) { return m.content.indexOf("871 votes") > -1; }).length));
check("the thread's first turn still has the translations",
  followed[1].content.indexOf("World English Bible, Updated: For God so loved") > -1);
check("a system turn in the history is not passed through twice",
  A.buildMessages(context, "", "plain", [{ role: "system", content: "x" }, thread[0]])
    .filter(function (m) { return m.role === "system"; }).length === 1);
check("an empty thread falls back to carrying the material",
  A.buildMessages(context, "Why?", "plain", [])[1].content.indexOf("Romans 5:8") > -1);
check("switching mode mid-conversation rewrites the instructions, not the thread",
  A.buildMessages(context, "", "teach", thread)[0].content.indexOf("do not write a sermon") > -1 &&
  A.buildMessages(context, "", "teach", thread).length === 4);
check("the material is in the same turn as the question",
  messages[1].content.indexOf("Romans 5:8") > -1);
check("an empty question is still well formed",
  A.buildMessages(context, "").length === 2);

/* ---------- the streaming path, through the stub ---------- */

const stub = A.stubEngine();
const stubbed = A.ask(stub, A.buildMessages(context, "What does this say?"), null);
check("the stub answers", typeof stubbed.then === "function");

stubbed.then(function (whole) {
  check("the answer streams out whole", whole.indexOf("stub engine") > -1, whole.slice(0, 60));
  check("the question reached the model", whole.indexOf("What does this say?") > -1, whole.slice(-60));

  let pieces = 0;
  return A.ask(A.stubEngine(), A.buildMessages(context, "q"), function () { pieces++; }).then(function () {
    check("tokens are handed over as they arrive", pieces > 3, pieces + " pieces");
  });
}).then(function () {
  check("asking with no engine fails loudly rather than silently",
    A.ask(null, [], null).then(function () { return false; }, function () { return true; }) instanceof Promise);
  return A.ask(null, [], null).then(function () { check("no engine should not resolve", false); },
    function (err) { check("no engine gives a useful error", /no model is loaded/i.test(err.message), err.message); });
}).then(function () {
  if (failures.length) {
    failures.forEach(function (f) { console.log("FAIL: " + f); });
    console.log(failures.length + " failure(s)");
    process.exit(1);
  }
  console.log("checked the model list, the prompt, and the streaming path; all checks passed");
}).catch(function (err) {
  console.log("FAIL: the checks threw — " + err.message);
  process.exit(1);
});
