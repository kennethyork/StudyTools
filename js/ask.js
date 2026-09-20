/* Asking a local model about a verse.

   There is no server here, and this keeps it that way: the model is downloaded
   once into the browser and runs on the reader's own device through WebGPU, so
   nothing typed is sent anywhere. The price is honest and stated to the reader
   before anything happens — a download of hundreds of megabytes to two
   gigabytes, a browser that has WebGPU, and a small model that is fluent and
   sometimes wrong.

   What it is good for is thinking alongside the material the site already
   holds, so that material is what we send it: the verse in every translation
   that carries it, the ranked cross-references, the Greek or Hebrew words, and
   where the Prayer Book reads it. The instructions tell it to answer from that
   and to say when it cannot. It cannot verify anything, so it is offered as a
   study aid, never as an authority.

   Loaded with a plain <script>, exposing window.STAsk; under node it sets
   module.exports, which is how scripts/check-ask.js runs the prompt builder. */
(function () {
  "use strict";

  var WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

  /* Llama first, as asked. Sizes are the download, roughly, at the quantisation
     WebLLM ships (q4f16). */
  var MODELS = [
    { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B",
      size: "\u22481.8 GB", note: "the default \u2014 better answers, slower to start" },
    { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B",
      size: "\u22480.7 GB", note: "much faster to start, plainly weaker" },
    { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B",
      size: "\u22480.9 GB", note: "a middle size" }
  ];

  var SYSTEM = [
    "You are a study aid inside a Bible-reading app. The reader is looking at one passage and has",
    "supplied everything you may use: the text in one or more translations, ranked cross-references,",
    "the Hebrew or Greek words behind it, and where the Book of Common Prayer (1928) reads it.",

    "Answer only from that material, and cite the references you use by name (\"Romans 5:8\").",
    "Quote only the translations listed. Never invent a quotation, a reference, a Hebrew or Greek word,",
    "a date, or a historical claim.",

    "Read the passage as the kind of writing it is. Narrative tells what happened; it is not a command.",
    "Law is addressed to Israel. Poetry and prophecy work by image, parallelism and hyperbole, and are",
    "not flat description. Wisdom literature reasons from observation and admits counter-cases.",
    "Gospel and Acts are ancient biography and history, ordered for their own purposes. Letters answer",
    "particular situations, so what is said to one church may not be addressed to everyone.",
    "Apocalyptic writes in visions and symbols. When the kind of writing makes a question unanswerable",
    "from the text, say that plainly.",

    "Keep the two testaments and the shape of the canon in view: what a passage assumes from what comes",
    "before it, and what it is taken up into later. Use the cross-references supplied for that.",

    "Distinguish what the text says from what a tradition reads into it. Where Christian traditions read",
    "a passage differently, or where a Jewish reading differs from a Christian one, say so rather than",
    "choosing silently.",

    "Do not preach, do not moralise, do not speak as God, and do not give spiritual direction about the",
    "reader's own life or decisions: point them back to the text, to the readings given, and to their own",
    "church. You are not a pastor, a priest, or a scholar, and you should not sound like one.",

    "Be brief and concrete: a short paragraph, or a few bullets, in plain present-day English. If the",
    "material does not answer the question, say so and say what would."
  ].join(" ");

  /* Ways of asking, each pointing the model at one part of the material the
     reader's own page has assembled. The rules above hold in all of them. */
  var MODES = [
    { id: "plain", label: "The plain sense", question: "What does this passage say?",
      instruction: "Explain the passage in its own terms: what it says, to whom, and what kind of " +
        "writing it is. Where the translations supplied differ, say what each brings out." },
    { id: "story", label: "In the Bible's story", question: "Where does this sit in the Bible's story?",
      instruction: "Place the passage in its setting: which testament and book, what has come before " +
        "in that book, what it assumes from earlier Scripture, and what later Scripture takes up. Use " +
        "the cross-references supplied, and cite them." },
    { id: "words", label: "What the Hebrew or Greek adds", question: "What do the original words add?",
      instruction: "Explain what the words supplied in the original language add to the reading: what " +
        "the word means, how the translations render it differently, and what English does not carry. " +
        "Use only the words supplied, and do not add others." },
    { id: "church", label: "How the church reads it", question: "How does the church read this?",
      instruction: "Say how this passage is read in the church's year: use the Prayer Book readings " +
        "supplied, with their season and office, and what that placing brings out. If none are supplied, " +
        "say so rather than inventing one." },
    { id: "teach", label: "Helping me teach it", question: "How would I teach this passage?",
      instruction: "Help the reader teach this passage: the point it makes, one or two questions worth " +
        "asking of it, and what not to overclaim. Keep it usable in five minutes, and do not write a " +
        "sermon." }
  ];

  function modeById(id) {
    for (var i = 0; i < MODES.length; i++) { if (MODES[i].id === id) { return MODES[i]; } }
    return null;
  }

  var CAVEAT = "The model is small, runs on your device, and can be confidently wrong. " +
    "It is here to help you think, not to be trusted: check anything it says against the text and the " +
    "references above it.";

  /* navigator.gpu can exist without a usable adapter, which is the difference
     between "this browser knows about WebGPU" and "this machine can run it". */
  function hasWebGPU() {
    return typeof navigator !== "undefined" && !!navigator.gpu && !!navigator.gpu.requestAdapter;
  }

  function detect() {
    if (!hasWebGPU()) { return Promise.resolve(false); }
    return navigator.gpu.requestAdapter().then(function (adapter) {
      return !!adapter;
    }).catch(function () { return false; });
  }

  function modelById(id) {
    for (var i = 0; i < MODELS.length; i++) { if (MODELS[i].id === id) { return MODELS[i]; } }
    return null;
  }

  /* Which of the offered models this browser can actually run: the preferred one
     if the library lists it, otherwise the first three-billion-ish, otherwise
     the first. Keeps a wrong id from being a hard failure. */
  function pickModel(list, preferred) {
    var ids = (list || []).map(function (m) { return m.model_id || m.id || m; });
    var want = preferred || MODELS[0].id;
    if (ids.indexOf(want) > -1) { return want; }
    for (var i = 0; i < MODELS.length; i++) {
      if (ids.indexOf(MODELS[i].id) > -1) { return MODELS[i].id; }
    }
    for (var j = 0; j < ids.length; j++) {
      if (/3B|3b/.test(ids[j])) { return ids[j]; }
    }
    return ids[0] || want;
  }

  /* ---------- what the model is told ---------- */

  function bullet(label, values) {
    if (!values || !values.length) { return ""; }
    return label + "\n" + values.map(function (v) { return "- " + v; }).join("\n") + "\n\n";
  }

  /* context: { label, translations: [{name, text}], references: [{ref, votes}],
               words: [{g, t, e}], readings: [string] } */
  function contextBlock(context) {
    var ctx = context || {};
    var out = "Passage: " + (ctx.label || "(unstated)") + "\n\n";

    out += bullet("Translations the reader has:", (ctx.translations || []).map(function (t) {
      return t.name + ": " + t.text;
    }));
    out += bullet("Cross-references (ranked by how often they are cited):",
      (ctx.references || []).map(function (r) {
        return r.ref + (r.votes ? " (" + r.votes + " votes)" : "");
      }));
    out += bullet("The words behind it, in the original language:",
      (ctx.words || []).map(function (w) {
        return [w.g, w.t ? "(" + w.t + ")" : "", w.e ? "\u2014 " + w.e : ""].join(" ").replace(/\s+/g, " ").trim();
      }));
    out += bullet("Read in the Book of Common Prayer (1928):", ctx.readings || []);

    if (!ctx.translations || !ctx.translations.length) {
      out += "Note: no translation text was available for this passage.\n";
    }
    return out.trim();
  }

  /* A first question carries the material; the turns after it are the thread,
     and the material is already in it. The system turn is rebuilt every time,
     so changing the way of asking applies to the conversation from there on. */
  function buildMessages(context, question, modeId, history) {
    var mode = modeById(modeId);
    var system = mode ? SYSTEM + " " + mode.instruction : SYSTEM;
    var messages = [{ role: "system", content: system }];
    var thread = (history || []).filter(function (m) { return m && m.role && m.role !== "system"; });
    if (thread.length) { return messages.concat(thread); }
    messages.push({ role: "user",
      content: contextBlock(context) + "\n\nQuestion: " + String(question || "").trim() });
    return messages;
  }

  /* ---------- the engine ---------- */

  var enginePromise = null;
  var engineId = null;

  /* A stand-in engine for the checks and for a browser without WebGPU, so the
     page can be exercised without a model. Reached only by ?fakeModel=1. */
  function stubEngine() {
    return {
      chat: { completions: { create: function (options) {
        var answer = "This is the stub engine: no model is loaded. It exists so the page can be " +
          "checked without WebGPU. The question was: " + options.messages[options.messages.length - 1].content
            .split("Question: ").pop();
        return Promise.resolve((function () {
          var i = 0;
          return {
            [Symbol.asyncIterator]: function () {
              return {
                next: function () {
                  if (i >= answer.length) { return Promise.resolve({ done: true }); }
                  var piece = answer.slice(i, i + 12);
                  i += 12;
                  return Promise.resolve({ done: false, value: { choices: [{ delta: { content: piece } }] } });
                }
              };
            }
          };
        })());
      } } }
    };
  }

  function load(modelId, onProgress, useStub) {
    if (enginePromise) { return enginePromise; }
    engineId = modelId || MODELS[0].id;
    if (useStub) {
      enginePromise = Promise.resolve(stubEngine());
      return enginePromise;
    }
    enginePromise = import(WEBLLM_URL).then(function (webllm) {
      var chosen = pickModel(webllm.prebuiltAppConfig && webllm.prebuiltAppConfig.model_list, modelId);
      engineId = chosen;
      return webllm.CreateMLCEngine(chosen, {
        initProgressCallback: function (report) {
          if (typeof onProgress === "function") { onProgress(report || {}); }
        }
      });
    }).catch(function (err) {
      enginePromise = null;
      throw err;
    });
    return enginePromise;
  }

  function loaded() { return !!enginePromise; }
  function currentModel() { return engineId; }

  function unload() { enginePromise = null; engineId = null; }

  /* Streaming answers: call onToken as text arrives, resolve with the whole
     answer when the model stops. */
  function ask(engine, messages, onToken) {
    if (!engine || !engine.chat || !engine.chat.completions) {
      return Promise.reject(new Error("No model is loaded."));
    }
    var whole = "";
    return engine.chat.completions.create({
      messages: messages, stream: true, temperature: 0.6, max_tokens: 600
    }).then(async function (chunks) {
      for await (var chunk of chunks) {
        var delta = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        var piece = delta && delta.content;
        if (piece) {
          whole += piece;
          if (typeof onToken === "function") { onToken(piece, whole); }
        }
      }
      return whole;
    });
  }

  var api = {
    MODELS: MODELS,
    MODES: MODES,
    SYSTEM: SYSTEM,
    modeById: modeById,
    CAVEAT: CAVEAT,
    WEBLLM_URL: WEBLLM_URL,
    hasWebGPU: hasWebGPU,
    detect: detect,
    modelById: modelById,
    pickModel: pickModel,
    contextBlock: contextBlock,
    buildMessages: buildMessages,
    load: load,
    loaded: loaded,
    currentModel: currentModel,
    unload: unload,
    ask: ask,
    stubEngine: stubEngine
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STAsk = api; }
})();
