/* Your own data: what this site has put in your browser, and how to move it.

   There is no account and no server, so "sync" means carrying your own data:
   one file to export and import, or a compressed code to paste on the other
   device. Both go through the same merge, which is the interesting part — two
   devices that have each been read from need their reading brought together,
   not one overwriting the other.

   The rules here are deliberately conservative and per key:
     - verse notes, and highlighted verses: per item, the most recently
       changed wins
     - reading-plan ticks: the union of days read (a set, so it only grows)
     - memory deck: the union of verses, keeping whichever card has more
       reviews behind it
     - vocabulary mastery: the union of what is known
     - anything else: what is already here is kept, and the clash is reported
       rather than guessed at.

   Loaded with a plain <script>, exposing window.STData; under node it sets
   module.exports, which is how scripts/check-yourdata.js runs the merge. */
(function () {
  "use strict";

  var PREFIX = "studytools.";
  var FORMAT = "studytools.backup";
  var VERSION = 1;

  /* How each key is brought together, where bringing it together is obvious. */
  var NOTES = "verse-notes.v1";
  var MARKS = "highlights.v1";
  var PLAN = "reading-plan.v1";
  var DECK = "memory-deck.v1";
  var VOCAB = "vocab-progress.v1";

  function isObject(v) { return v && typeof v === "object" && !Array.isArray(v); }

  /* The site's own keys, from a plain object of raw stored values. */
  function collect(store) {
    var out = {};
    Object.keys(store || {}).forEach(function (key) {
      if (key.indexOf(PREFIX) !== 0) { return; }
      var short = key.slice(PREFIX.length);
      if (short === "theme") { return; }             /* a display preference, not data */
      var value = store[key];
      if (value === null || value === undefined || value === "") { return; }
      try { out[short] = JSON.parse(value); } catch (e) { /* not ours to move */ }
    });
    return out;
  }

  /* ---------- merging ---------- */

  function mergeNotes(local, incoming) {
    var out = {}, changed = 0;
    Object.keys(local || {}).forEach(function (k) { out[k] = local[k]; });
    Object.keys(incoming || {}).forEach(function (k) {
      var mine = out[k], theirs = incoming[k];
      if (!mine) { out[k] = theirs; changed++; return; }
      var mineAt = mine.updated || "", theirsAt = theirs.updated || "";
      if (theirsAt > mineAt && theirs.text !== mine.text) { out[k] = theirs; changed++; }
    });
    return { value: out, changed: changed };
  }

  function mergePlan(local, incoming) {
    var out = {}, changed = 0;
    var a = isObject(local) ? local : {}, b = isObject(incoming) ? incoming : {};
    ["id", "start", "tr"].forEach(function (field) {
      out[field] = a[field] !== undefined ? a[field] : b[field];
    });
    var done = {};
    [a.done, b.done].forEach(function (set) {
      Object.keys(set || {}).forEach(function (day) {
        if (!done[day]) { if (set[day]) { done[day] = true; changed++; } }
      });
    });
    out.done = done;
    return { value: out, changed: changed };
  }

  function mergeDeck(local, incoming) {
    var out = [], seen = {}, changed = 0;
    (local || []).forEach(function (card) { if (card && card.ref) { seen[card.ref] = card; out.push(card); } });
    (incoming || []).forEach(function (card) {
      if (!card || !card.ref) { return; }
      var mine = seen[card.ref];
      if (!mine) { seen[card.ref] = card; out.push(card); changed++; return; }
      /* keep whichever card has been reviewed more: its schedule is the further along */
      if ((card.reps || 0) > (mine.reps || 0)) {
        var at = out.indexOf(mine);
        out[at] = card;
        seen[card.ref] = card;
        changed++;
      }
    });
    return { value: out, changed: changed };
  }

  function mergeVocab(local, incoming) {
    var out = {}, changed = 0;
    Object.keys(local || {}).forEach(function (k) { out[k] = local[k]; });
    Object.keys(incoming || {}).forEach(function (k) {
      if (out[k] === undefined) { out[k] = incoming[k]; changed++; }
      else if (incoming[k] && !out[k]) { out[k] = incoming[k]; changed++; }
    });
    return { value: out, changed: changed };
  }

  /* merge(local, incoming) -> { data, report }
     report: [{ key, action, note }] so the page can say what it did. */
  function merge(local, incoming) {
    var data = {}, report = [];
    var keys = {};
    Object.keys(local || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(incoming || {}).forEach(function (k) { keys[k] = true; });

    Object.keys(keys).sort().forEach(function (key) {
      var mine = (local || {})[key], theirs = (incoming || {})[key];

      if (mine === undefined) {
        data[key] = theirs;
        report.push({ key: key, action: "added", note: "only the incoming copy had it" });
        return;
      }
      if (theirs === undefined) {
        data[key] = mine;
        report.push({ key: key, action: "kept", note: "only this device had it" });
        return;
      }
      if (JSON.stringify(mine) === JSON.stringify(theirs)) {
        data[key] = mine;
        report.push({ key: key, action: "same", note: "both copies agree" });
        return;
      }

      var result = null;
      if (key === NOTES || key === MARKS) { result = mergeNotes(mine, theirs); }
      else if (key === PLAN) { result = mergePlan(mine, theirs); }
      else if (key === DECK) { result = mergeDeck(mine, theirs); }
      else if (key === VOCAB) { result = mergeVocab(mine, theirs); }

      if (result) {
        data[key] = result.value;
        report.push({ key: key, action: result.changed ? "merged" : "same",
          note: result.changed + (result.changed === 1 ? " change" : " changes") + " brought in" });
      } else {
        data[key] = mine;
        report.push({ key: key, action: "conflict",
          note: "the two copies differ and this one cannot be merged safely; kept this device's. " +
                "Export before importing if you want the other." });
      }
    });
    return { data: data, report: report };
  }

  /* ---------- a short summary, for the page and for the code ---------- */

  function summary(data) {
    var d = data || {};
    var plan = d[PLAN] || {};
    return {
      notes: Object.keys(d[NOTES] || {}).length,
      ticks: Object.keys(plan.done || {}).length,
      deck: (d[DECK] || []).length,
      words: Object.keys(d[VOCAB] || {}).length,
      keys: Object.keys(d).length
    };
  }

  function describe(data) {
    var s = summary(data);
    var bits = [];
    if (s.notes) { bits.push(s.notes + (s.notes === 1 ? " verse note" : " verse notes")); }
    if (s.ticks) { bits.push(s.ticks + (s.ticks === 1 ? " day ticked" : " days ticked")); }
    if (s.deck) { bits.push(s.deck + (s.deck === 1 ? " memory card" : " memory cards")); }
    if (s.words) { bits.push(s.words + " words marked known"); }
    return bits.length ? bits.join(", ") : "nothing saved yet";
  }

  /* ---------- the code: the same data, compressed ---------- */

  function bytesToBase64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) { binary += String.fromCharCode(bytes[i]); }
    var b64 = (typeof btoa === "function")
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64ToBytes(text) {
    var b64 = String(text).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) { b64 += "="; }
    var binary = (typeof atob === "function")
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) { out[i] = binary.charCodeAt(i); }
    return out;
  }

  /* "deflate" rather than "deflate-raw": browsers do both, node's streams do
     not, and the code has to be readable by the same code in both. */
  function deflate(text) {
    if (typeof CompressionStream !== "function") { return Promise.resolve(null); }
    var stream = new CompressionStream("deflate");
    var writer = stream.writable.getWriter();
    writer.write(new TextEncoder().encode(text));
    writer.close();
    return new Response(stream.readable).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    }).catch(function () { return null; });
  }

  function inflate(bytes) {
    if (typeof DecompressionStream !== "function") { return Promise.reject(new Error("no decompression here")); }
    var stream = new DecompressionStream("deflate");
    var writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(stream.readable).text();
  }

  /* A code carries the data and, so the other device can report honestly, the
     counts it started from. */
  function toCode(data) {
    var payload = JSON.stringify({ format: FORMAT, version: VERSION,
      exported: new Date().toISOString(), data: data || {} });
    return deflate(payload).then(function (packed) {
      if (!packed) { return "plain:" + bytesToBase64(new TextEncoder().encode(payload)); }
      return "z:" + bytesToBase64(packed);
    });
  }

  function fromCode(code) {
    var text = String(code || "").trim();
    if (text.indexOf("z:") === 0) {
      return inflate(base64ToBytes(text.slice(2))).then(parse);
    }
    if (text.indexOf("plain:") === 0) {
      return Promise.resolve(parse(new TextDecoder().decode(base64ToBytes(text.slice(6)))));
    }
    return Promise.reject(new Error("that does not look like a sync code"));
  }

  function parse(json) {
    var parsed = JSON.parse(json);
    if (!parsed || parsed.format !== FORMAT) { throw new Error("that is not a StudyTools backup"); }
    return parsed.data || {};
  }

  /* The code in the address bar, so a phone can be handed one by opening a link
     on it: apps/sync/#d=<code>. Fragments are never sent to a server. */
  function codeFromHash(hash) {
    var m = /[#&]d=([^&]+)/.exec(String(hash || ""));
    return m ? decodeURIComponent(m[1]) : null;
  }

  var api = {
    PREFIX: PREFIX,
    FORMAT: FORMAT,
    VERSION: VERSION,
    collect: collect,
    merge: merge,
    summary: summary,
    describe: describe,
    toCode: toCode,
    fromCode: fromCode,
    codeFromHash: codeFromHash
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STData = api; }
})();
