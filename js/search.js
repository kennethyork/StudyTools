/* Word search over the site's own translations.

   There is no server to ask, so scripts/build-search.py builds a word list for
   each translation and ships it: one entry per word, holding the verses it
   appears in, delta-encoded so the numbers stay small. Verse ids are
   arithmetic — book index within data/bible/books.json, then chapter, then
   verse — so the index needs no table of references, and the same id means the
   same verse in every translation.

   Tokenising happens twice: once in the build, once here when a reader types.
   The rules have to agree exactly, so the build writes
   data/search/tokens-sample.json from real verses and scripts/check-search.js
   re-tokenises those with this file.

   Loaded with a plain <script>, exposing window.STSearch; under node it sets
   module.exports, which is how that check runs it. */
(function () {
  "use strict";

  /* The token pattern, as a string: a /g/ regex reused across calls carries
     lastIndex between them, which is a trap worth not setting. */
  var TOKEN_PATTERN = "[a-z0-9']+";
  var BOOK_STRIDE = 1000000;
  var CHAPTER_STRIDE = 1000;

  /* Lower-case, split on everything but letters, digits and apostrophes, drop
     one-character tokens and anything without a letter. Keep in step with
     tokenize() in scripts/build-search.py. */
  function tokenize(text) {
    var out = [];
    var found = String(text == null ? "" : text).toLowerCase().replace(/\u2019/g, "'")
      .match(new RegExp(TOKEN_PATTERN, "g")) || [];
    for (var i = 0; i < found.length; i++) {
      var token = found[i].replace(/^'+|'+$/g, "");
      if (token.length < 2 || !/[a-z]/.test(token)) { continue; }
      out.push(token);
    }
    return out;
  }

  /* A word's verses, from "1,3,120" back to [1, 4, 124]. */
  function decode(postings) {
    var out = [];
    if (!postings) { return out; }
    var parts = String(postings).split(",");
    var previous = 0;
    for (var i = 0; i < parts.length; i++) {
      previous += Number(parts[i]);
      out.push(previous);
    }
    return out;
  }

  function idOf(bookIndex, chapter, verse) {
    return bookIndex * BOOK_STRIDE + chapter * CHAPTER_STRIDE + verse;
  }

  /* An id back to a reference, using the book table in data/search/index.json. */
  function refOf(books, id) {
    var bookIndex = Math.floor(id / BOOK_STRIDE);
    var rest = id % BOOK_STRIDE;
    var chapter = Math.floor(rest / CHAPTER_STRIDE);
    var verse = rest % CHAPTER_STRIDE;
    var book = (books || [])[bookIndex] || { slug: "", name: "?" };
    return {
      id: id, bookIndex: bookIndex, slug: book.slug, book: book.name,
      chapter: chapter, verse: verse,
      label: book.name + " " + chapter + ":" + verse
    };
  }

  function intersect(a, b) {
    var out = [], i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { out.push(a[i]); i++; j++; }
      else if (a[i] < b[j]) { i++; } else { j++; }
    }
    return out;
  }

  /* Every word has to be there (an AND search). The rarest word leads, so the
     lists being intersected stay as short as they can. */
  function search(index, text, options) {
    var terms = tokenize(text);
    var unique = [], seen = {};
    terms.forEach(function (t) { if (!seen[t]) { seen[t] = 1; unique.push(t); } });
    var result = { terms: unique, ids: [], missing: [], truncated: false };
    if (!unique.length) { return result; }

    var lists = [];
    for (var i = 0; i < unique.length; i++) {
      var postings = (index.postings || {})[unique[i]];
      if (!postings) { result.missing.push(unique[i]); continue; }
      lists.push({ term: unique[i], ids: decode(postings) });
    }
    if (result.missing.length) { return result; }

    lists.sort(function (a, b) { return a.ids.length - b.ids.length; });
    var ids = lists[0].ids;
    for (var j = 1; j < lists.length && ids.length; j++) {
      ids = intersect(ids, lists[j].ids);
    }

    if (options && options.bookIndex != null) {
      ids = ids.filter(function (id) { return Math.floor(id / BOOK_STRIDE) === options.bookIndex; });
    }
    var limit = (options && options.limit) || 0;
    if (limit && ids.length > limit) { ids = ids.slice(0, limit); result.truncated = true; }
    result.ids = ids;
    return result;
  }

  /* The verse as pieces, marking the words that matched, for the app to build
     into elements: [{text, hit}]. */
  function mark(text, terms) {
    var wanted = {};
    (terms || []).forEach(function (t) { wanted[t] = true; });
    var body = String(text == null ? "" : text);
    var out = [], last = 0;
    var re = new RegExp(TOKEN_PATTERN, "gi");      /* the verse keeps its own case */
    var m;
    while ((m = re.exec(body)) !== null) {
      var token = m[0].replace(/^'+|'+$/g, "").toLowerCase();
      if (!(wanted[token] && token.length >= 2 && /[a-z]/.test(token))) { continue; }
      if (m.index > last) { out.push({ text: body.slice(last, m.index), hit: false }); }
      out.push({ text: m[0], hit: true });
      last = m.index + m[0].length;
    }
    if (last < body.length) { out.push({ text: body.slice(last), hit: false }); }
    return out;
  }

  /* Does the query name a reference rather than words? "john 3:16" is a jump,
     not a search. */
  function asReference(query, parseRef) {
    if (typeof parseRef !== "function") { return null; }
    return parseRef(query);
  }

  var api = {
    tokenize: tokenize,
    decode: decode,
    idOf: idOf,
    refOf: refOf,
    intersect: intersect,
    search: search,
    mark: mark,
    asReference: asReference,
    strides: { book: 1000000, chapter: 1000 }
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STSearch = api; }
})();
