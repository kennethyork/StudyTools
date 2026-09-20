/* Verse notes: what a reader writes against a verse.

   A note belongs to a verse, keyed "book-slug.chapter.verse", and holds the
   text and when it was last changed. Everything here is a pure function over a
   plain object, so the rules can be checked without a browser;
   apps/notes/app.js and the reader do the localStorage and the drawing.

   The store is kept in one place — studytools.verse-notes.v1 — so a note
   written in the reader shows up in the Notes app and the other way about.

   Loaded with a plain <script>, exposing window.STNotes; under node it sets
   module.exports, which is how scripts/check-notes.js runs it. */
(function () {
  "use strict";

  var STORE_KEY = "verse-notes.v1";

  function key(slug, chapter, verse) {
    return slug + "." + Number(chapter) + "." + Number(verse);
  }

  function parseKey(k) {
    var parts = String(k || "").split(".");
    if (parts.length !== 3) { return null; }
    var chapter = Number(parts[1]), verse = Number(parts[2]);
    if (!parts[0] || !chapter || !verse) { return null; }
    return { slug: parts[0], chapter: chapter, verse: verse };
  }

  /* Both writers hand back a new object rather than changing the one they were
     given: a store that mutates under its callers is a bug waiting to happen. */
  function copy(notes) {
    var next = {};
    Object.keys(notes || {}).forEach(function (k) { next[k] = notes[k]; });
    return next;
  }

  /* Write or replace a note. Empty text removes it: a note with nothing in it
     is not a note. */
  function put(notes, k, text, when) {
    var body = String(text == null ? "" : text).trim();
    var next = copy(notes);
    if (!body) { delete next[k]; return next; }
    next[k] = { text: body, updated: when || new Date().toISOString() };
    return next;
  }

  function remove(notes, k) {
    var next = copy(notes);
    delete next[k];
    return next;
  }

  function get(notes, k) {
    return (notes || {})[k] || null;
  }

  function textFor(notes, slug, chapter, verse) {
    var note = get(notes, key(slug, chapter, verse));
    return note ? note.text : "";
  }

  function count(notes) {
    return Object.keys(notes || {}).length;
  }

  /* The notes on one chapter, as {verse: note}, for the reader to mark up. */
  function forChapter(notes, slug, chapter) {
    var out = {};
    Object.keys(notes || {}).forEach(function (k) {
      var parsed = parseKey(k);
      if (parsed && parsed.slug === slug && parsed.chapter === Number(chapter)) {
        out[parsed.verse] = notes[k];
      }
    });
    return out;
  }

  /* Newest change first, which is how a person looks for what they just wrote. */
  function byUpdated(notes) {
    return Object.keys(notes || {}).map(function (k) {
      var parsed = parseKey(k) || { slug: k, chapter: 0, verse: 0 };
      return { key: k, slug: parsed.slug, chapter: parsed.chapter, verse: parsed.verse,
               text: notes[k].text, updated: notes[k].updated || "" };
    }).sort(function (a, b) {
      if (a.updated === b.updated) { return a.key < b.key ? -1 : 1; }
      return a.updated < b.updated ? 1 : -1;
    });
  }

  /* The canonical order of the books, if the caller knows it: scripture order
     rather than the order things were typed. */
  function byScripture(notes, order) {
    var rank = {};
    (order || []).forEach(function (slug, i) { rank[slug] = i; });
    return Object.keys(notes || {}).map(function (k) {
      var parsed = parseKey(k) || { slug: k, chapter: 0, verse: 0 };
      return { key: k, slug: parsed.slug, chapter: parsed.chapter, verse: parsed.verse,
               text: notes[k].text, updated: notes[k].updated || "" };
    }).sort(function (a, b) {
      var ra = rank[a.slug] == null ? 999 : rank[a.slug];
      var rb = rank[b.slug] == null ? 999 : rank[b.slug];
      if (ra !== rb) { return ra - rb; }
      if (a.chapter !== b.chapter) { return a.chapter - b.chapter; }
      return a.verse - b.verse;
    });
  }

  function label(slug, chapter, verse, names) {
    var name = (names || {})[slug] || slug;
    return name + " " + chapter + ":" + verse;
  }

  /* The whole lot as Markdown, for keeping or carrying elsewhere.
     names: slug -> book name; verses: (slug, chapter, verse) -> text, optional. */
  function toMarkdown(notes, options) {
    var opts = options || {};
    var names = opts.names || {};
    var verses = opts.verses || null;
    var list = byScripture(notes, opts.order);
    if (!list.length) { return ""; }

    var lines = ["# Verse notes", ""];
    if (opts.date) { lines.push("_Exported " + opts.date + ". " +
      list.length + (list.length === 1 ? " note." : " notes.") + "_"); lines.push(""); }

    var book = null, chapter = null;
    list.forEach(function (n) {
      if (n.slug !== book) {
        book = n.slug;
        chapter = null;
        lines.push("## " + (names[book] || book));
        lines.push("");
      }
      if (n.chapter !== chapter) {
        chapter = n.chapter;
        lines.push("### " + (names[book] || book) + " " + chapter);
        lines.push("");
      }
      lines.push("- **" + n.chapter + ":" + n.verse + "** " + n.text.replace(/\s*\n\s*/g, " "));
      if (verses) {
        var text = verses(n.slug, n.chapter, n.verse);
        if (text) { lines.push("  > " + text.replace(/\s*\n\s*/g, " ")); }
      }
    });
    lines.push("");
    return lines.join("\n");
  }

  var api = {
    STORE_KEY: STORE_KEY,
    key: key,
    parseKey: parseKey,
    put: put,
    remove: remove,
    get: get,
    textFor: textFor,
    count: count,
    forChapter: forChapter,
    byUpdated: byUpdated,
    byScripture: byScripture,
    label: label,
    toMarkdown: toMarkdown
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STNotes = api; }
})();
