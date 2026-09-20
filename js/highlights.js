/* Highlighting: a verse marked in a colour, with or without a note.

   Kept apart from verse notes on purpose — a verse can be marked because it
   struck you without your having anything to say about it — and kept to a
   couple of colours, because a page of six colours is a page nobody reads.

   The colours are named rather than coded (gold, green, blue, rose) so the
   reader's chosen palette can change without the stored data meaning something
   different. The names are what the stylesheet styles.

   Loaded with a plain <script>, exposing window.STHighlights; under node it
   sets module.exports, which is how scripts/check-highlights.js runs it. */
(function () {
  "use strict";

  var STORE_KEY = "highlights.v1";

  var COLOURS = [
    { id: "gold", label: "Gold", note: "what I want to keep" },
    { id: "green", label: "Green", note: "promise" },
    { id: "blue", label: "Blue", note: "teaching" },
    { id: "rose", label: "Rose", note: "warning, or hard" }
  ];

  var BY_ID = {};
  COLOURS.forEach(function (c) { BY_ID[c.id] = c; });

  function isColour(id) { return !!BY_ID[id]; }
  function colour(id) { return BY_ID[id] || null; }

  function key(slug, chapter, verse) { return slug + "." + Number(chapter) + "." + Number(verse); }

  function parseKey(k) {
    var parts = String(k || "").split(".");
    if (parts.length !== 3) { return null; }
    var chapter = Number(parts[1]), verse = Number(parts[2]);
    if (!parts[0] || !chapter || !verse) { return null; }
    return { slug: parts[0], chapter: chapter, verse: verse };
  }

  /* Mark a verse. An unknown colour, or "none", clears the mark: the same
     action as reaching for the eraser. */
  function put(highlights, k, colourId, when) {
    var next = {};
    Object.keys(highlights || {}).forEach(function (x) { next[x] = highlights[x]; });
    if (!isColour(colourId)) { delete next[k]; return next; }
    next[k] = { colour: colourId, updated: when || new Date().toISOString() };
    return next;
  }

  function clear(highlights, k) { return put(highlights, k, null); }

  function get(highlights, k) { return (highlights || {})[k] || null; }

  function colourAt(highlights, slug, chapter, verse) {
    var mark = get(highlights, key(slug, chapter, verse));
    return mark ? mark.colour : null;
  }

  function count(highlights) { return Object.keys(highlights || {}).length; }

  /* The marks on one chapter, as {verse: colour}, for the reader to colour in. */
  function forChapter(highlights, slug, chapter) {
    var out = {};
    Object.keys(highlights || {}).forEach(function (k) {
      var parsed = parseKey(k);
      if (parsed && parsed.slug === slug && parsed.chapter === Number(chapter)) {
        out[parsed.verse] = highlights[k].colour;
      }
    });
    return out;
  }

  function byColour(highlights) {
    var out = {};
    COLOURS.forEach(function (c) { out[c.id] = 0; });
    Object.keys(highlights || {}).forEach(function (k) {
      var c = highlights[k].colour;
      if (out[c] !== undefined) { out[c]++; }
    });
    return out;
  }

  /* Newest first, or in the order of the books, for the pages that list them. */
  function list(highlights, order) {
    var rows = Object.keys(highlights || {}).map(function (k) {
      var parsed = parseKey(k) || { slug: k, chapter: 0, verse: 0 };
      return { key: k, slug: parsed.slug, chapter: parsed.chapter, verse: parsed.verse,
               colour: highlights[k].colour, updated: highlights[k].updated || "" };
    });
    if (order) {
      var rank = {};
      order.forEach(function (slug, i) { rank[slug] = i; });
      return rows.sort(function (a, b) {
        var ra = rank[a.slug] == null ? 999 : rank[a.slug];
        var rb = rank[b.slug] == null ? 999 : rank[b.slug];
        if (ra !== rb) { return ra - rb; }
        if (a.chapter !== b.chapter) { return a.chapter - b.chapter; }
        return a.verse - b.verse;
      });
    }
    return rows.sort(function (a, b) {
      if (a.updated === b.updated) { return a.key < b.key ? -1 : 1; }
      return a.updated < b.updated ? 1 : -1;
    });
  }

  /* The marks as Markdown, each with the colour it was marked in. */
  function toMarkdown(highlights, options) {
    var opts = options || {};
    var names = opts.names || {};
    var rows = list(highlights, opts.order);
    if (!rows.length) { return ""; }

    var lines = ["## Highlighted verses", ""];
    var book = null;
    rows.forEach(function (r) {
      if (r.slug !== book) {
        book = r.slug;
        lines.push("### " + (names[book] || book));
        lines.push("");
      }
      var text = opts.verses ? opts.verses(r.slug, r.chapter, r.verse) : null;
      lines.push("- **" + r.chapter + ":" + r.verse + "** _" + r.colour + "_" + (text ? " \u2014 " + text : ""));
    });
    lines.push("");
    return lines.join("\n");
  }

  var api = {
    STORE_KEY: STORE_KEY,
    COLOURS: COLOURS,
    isColour: isColour,
    colour: colour,
    key: key,
    parseKey: parseKey,
    put: put,
    clear: clear,
    get: get,
    colourAt: colourAt,
    count: count,
    forChapter: forChapter,
    byColour: byColour,
    list: list,
    toMarkdown: toMarkdown
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STHighlights = api; }
})();
