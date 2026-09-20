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
    "You are a study aid for a reader of the Bible who is looking at one passage.",
    "Answer only from the material supplied with the question. It is the reader's own copy of the site:",
    "public-domain translations, cross-references, and the original-language words.",
    "Cite the references you use, by name (for example, \"Romans 5:8\").",
    "Never quote a translation that is not listed in the material, and never invent a quotation,",
    "a reference, a historical claim, or a Hebrew or Greek word.",
    "If the material does not answer the question, say so plainly and say what would.",
    "Be brief: a short paragraph, or a few bullets. Plain present-day English."
  ].join(" ");

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

  function buildMessages(context, question) {
    return [
      { role: "system", content: SYSTEM },
      { role: "user", content: contextBlock(context) + "\n\nQuestion: " + String(question || "").trim() }
    ];
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
    SYSTEM: SYSTEM,
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
