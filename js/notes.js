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

  /* A note hangs on a verse, on a chapter, or on a book: "john.3.16",
     "john.3", "john". The chapter note is the page in your own study Bible;
     the book note is the cover. */
  function key(slug, chapter, verse) {
    if (chapter == null) { return String(slug); }
    if (verse == null || Number(verse) === 0) { return slug + "." + Number(chapter); }
    return slug + "." + Number(chapter) + "." + Number(verse);
  }

  function parseKey(k) {
    var parts = String(k || "").split(".");
    if (parts.length < 1 || parts.length > 3) { return null; }
    var slug = parts[0];
    if (!slug) { return null; }
    if (parts.length === 1) { return { slug: slug, chapter: null, verse: null }; }
    var chapter = Number(parts[1]);
    if (!chapter) { return null; }
    if (parts.length === 2) { return { slug: slug, chapter: chapter, verse: null }; }
    var verse = Number(parts[2]);
    if (!verse) { return null; }
    return { slug: slug, chapter: chapter, verse: verse };
  }

  /* What kind of thing a note is about, for the pages that show them. */
  function levelOf(noteKey) {
    var parsed = parseKey(noteKey);
    if (!parsed) { return null; }
    return parsed.verse ? "verse" : (parsed.chapter ? "chapter" : "book");
  }

  function bookKey(slug) { return String(slug); }
  function chapterKey(slug, chapter) { return slug + "." + Number(chapter); }

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

  /* The verse notes on one chapter, as {verse: note}, for the reader to mark up. */
  function forChapter(notes, slug, chapter) {
    var out = {};
    Object.keys(notes || {}).forEach(function (k) {
      var parsed = parseKey(k);
      if (parsed && parsed.verse && parsed.slug === slug && parsed.chapter === Number(chapter)) {
        out[parsed.verse] = notes[k];
      }
    });
    return out;
  }

  /* The note on the chapter itself, if there is one. */
  function chapterNote(notes, slug, chapter) {
    return get(notes, chapterKey(slug, chapter));
  }

  /* The note on the book. */
  function bookNote(notes, slug) {
    return get(notes, bookKey(slug));
  }

  /* Newest change first, which is how a person looks for what they just wrote. */
  function entry(key_, note) {
    var parsed = parseKey(key_) || { slug: key_, chapter: null, verse: null };
    return { key: key_, slug: parsed.slug, chapter: parsed.chapter, verse: parsed.verse,
             level: levelOf(key_), text: note.text, updated: note.updated || "" };
  }

  function byUpdated(notes) {
    return Object.keys(notes || {}).map(function (k) { return entry(k, notes[k]); })
      .sort(function (a, b) {
      if (a.updated === b.updated) { return a.key < b.key ? -1 : 1; }
      return a.updated < b.updated ? 1 : -1;
    });
  }

  /* The canonical order of the books, if the caller knows it: scripture order
     rather than the order things were typed. */
  function byScripture(notes, order) {
    var rank = {};
    (order || []).forEach(function (slug, i) { rank[slug] = i; });
    return Object.keys(notes || {}).map(function (k) { return entry(k, notes[k]); })
      .sort(function (a, b) {
        var ra = rank[a.slug] == null ? 999 : rank[a.slug];
        var rb = rank[b.slug] == null ? 999 : rank[b.slug];
        if (ra !== rb) { return ra - rb; }
        /* the book's own note first, then the chapter's, then its verses */
        var ca = a.chapter || 0, cb = b.chapter || 0;
        if (ca !== cb) { return ca - cb; }
        return (a.verse || 0) - (b.verse || 0);
      });
  }

  function label(slug, chapter, verse, names) {
    var name = (names || {})[slug] || slug;
    if (chapter == null) { return name; }
    if (verse == null) { return name + " " + chapter; }
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
      if (n.level === "book") {
        lines.push("_On the book:_ " + n.text.replace(/\s*\n\s*/g, " "));
        lines.push("");
        return;
      }
      if (n.chapter !== chapter) {
        chapter = n.chapter;
        lines.push("### " + (names[book] || book) + " " + chapter);
        lines.push("");
      }
      if (n.level === "chapter") {
        lines.push("_On the chapter:_ " + n.text.replace(/\s*\n\s*/g, " "));
        lines.push("");
        return;
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
    levelOf: levelOf,
    bookKey: bookKey,
    chapterKey: chapterKey,
    chapterNote: chapterNote,
    bookNote: bookNote,
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
