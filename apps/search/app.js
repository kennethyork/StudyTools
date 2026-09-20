/* Search the Bible: a word index built at build time (js/search.js holds the
   format and the querying), read whole by the browser — no server, no account,
   nothing typed leaves the machine. Depends on js/common.js and js/search.js. */
(function () {
  "use strict";

  var PAGE = 50;                  /* results drawn at a time */

  var els = {
    form: document.getElementById("search-form"),
    q: document.getElementById("q"),
    tr: document.getElementById("tr"),
    book: document.getElementById("book"),
    out: document.getElementById("out")
  };

  var meta = null;                /* data/search/index.json */
  var indexes = {};               /* translation -> the loaded word index */
  var promises = {};              /* chapter key -> request in flight */
  var loaded = {};                /* chapter key -> chapter data */
  var state = { query: "", translation: "WEBU", book: "", shown: PAGE, ids: [], terms: [] };

  function notice(text, isError) {
    return ST.el("p", { class: "notice" + (isError ? " error" : ""), text: text });
  }

  function indexOfBook(slug) {
    for (var i = 0; i < meta.books.length; i++) { if (meta.books[i].slug === slug) { return i; } }
    return null;
  }
  function bookName(slug) {
    var i = indexOfBook(slug);
    return i == null ? slug : meta.books[i].name;
  }
  function nameOf(id) {
    var found = null;
    (meta.translations || []).forEach(function (t) { if (t.id === id) { found = t.name; } });
    return found || id;
  }

  /* ---------- fetching ---------- */

  function loadIndex(translation) {
    if (indexes[translation]) { return Promise.resolve(indexes[translation]); }
    return ST.loadJSON(ST.siteRoot() + "data/search/" + translation + ".json").then(function (data) {
      indexes[translation] = data;
      return data;
    });
  }

  /* A chapter of the translation being searched, fetched once per translation. */
  function chapterData(slug, chapter) {
    var key = slug + "." + chapter + "." + state.translation;
    if (!promises[key]) {
      promises[key] = ST.loadTranslation(slug, state.translation).then(function (data) {
        loaded[key] = data;
        return data;
      }).catch(function () {
        loaded[key] = null;
        return null;
      });
    }
    return promises[key];
  }

  function textOf(ref) {
    var data = loaded[ref.slug + "." + ref.chapter + "." + state.translation];
    if (!data) { return ""; }
    var verses = (data.chapters || {})[String(ref.chapter)];
    return verses ? (verses[String(ref.verse)] || "") : "";
  }

  /* Fetch the chapters the shown results fall in — usually a handful, because
     results come in canonical order. */
  function ensureChapters(ids) {
    var wanted = {};
    ids.forEach(function (id) {
      var ref = STSearch.refOf(meta.books, id);
      wanted[ref.slug + "|" + ref.chapter] = true;
    });
    return Promise.all(Object.keys(wanted).map(function (key) {
      var parts = key.split("|");
      return chapterData(parts[0], parts[1]);
    }));
  }

  /* ---------- drawing ---------- */

  function referenceCard(parsed) {
    var i = indexOfBook(parsed.book);
    var label = (i == null ? parsed.book : meta.books[i].name) + " " + parsed.chapter +
      (parsed.verseStart ? ":" + parsed.verseStart +
        (parsed.verseEnd && parsed.verseEnd !== parsed.verseStart ? "-" + parsed.verseEnd : "") : "");
    var ref = encodeURIComponent(label);
    return ST.el("div", {}, [
      ST.el("p", { class: "serif", style: "font-size:1.15rem;margin:0 0 4px", text: label }),
      ST.el("p", { class: "muted small", style: "margin:0 0 10px", text: "That is a reference rather than words to search for." }),
      ST.el("div", { class: "row" }, [
        ST.el("a", { class: "btn", href: ST.siteRoot() + "apps/bible/?ref=" + ref, text: "Open in the reader \u2192" }),
        ST.el("a", { class: "btn secondary", href: ST.siteRoot() + "apps/study/?ref=" + ref, text: "Study this passage \u2192" }),
        ST.el("a", { class: "btn secondary", href: ST.siteRoot() + "apps/matrix/?ref=" + ref, text: "Compare translations \u2192" })
      ])
    ]);
  }

  function resultRow(ref, text) {
    var row = ST.el("div", { class: "result" });
    row.appendChild(ST.el("a", { class: "ref",
      href: ST.siteRoot() + "apps/bible/?ref=" + encodeURIComponent(ref.label), text: ref.label }));
    var body = ST.el("div", { class: "text" });
    STSearch.mark(text, state.terms).forEach(function (piece) {
      if (piece.hit) { body.appendChild(ST.el("mark", { class: "hit", text: piece.text })); }
      else { body.appendChild(document.createTextNode(piece.text)); }
    });
    row.appendChild(body);
    row.appendChild(ST.el("a", { class: "go",
      href: ST.siteRoot() + "apps/study/?ref=" + encodeURIComponent(ref.label), text: "study \u2192" }));
    return row;
  }

  function drawPage(ids, terms, translation, book) {
    var out = els.out;
    out.innerHTML = "";
    var shown = ids.slice(0, state.shown);

    out.appendChild(ST.el("p", { class: "count", text: ids.length.toLocaleString() +
      (ids.length === 1 ? " verse" : " verses") + " in the " + nameOf(translation) +
      (book ? ", in " + bookName(book) : "") +
      (state.shown < ids.length ? " \u2014 showing the first " + shown.length : "") }));

    ensureChapters(shown).then(function () {
      var lastBook = null;
      shown.forEach(function (id) {
        var ref = STSearch.refOf(meta.books, id);
        if (ref.book !== lastBook) {
          lastBook = ref.book;
          out.appendChild(ST.el("div", { class: "book-head", text: ref.book }));
        }
        out.appendChild(resultRow(ref, textOf(ref)));
      });
      if (state.shown < ids.length) {
        var more = ST.el("button", { type: "button", class: "secondary",
          text: "Show " + Math.min(PAGE, ids.length - state.shown) + " more" });
        more.addEventListener("click", function () {
          state.shown += PAGE;
          drawPage(ids, terms, translation, book);
        });
        out.appendChild(ST.el("div", { class: "row no-print", style: "margin-top:14px" }, [more]));
      }
    });
  }

  /* ---------- searching ---------- */

  function render() {
    var out = els.out;
    out.innerHTML = "";
    if (!state.query) {
      out.appendChild(notice("Type words to search for, or a reference to jump to."));
      return;
    }

    var parsed = STSearch.asReference(state.query, ST.parseRef);
    if (parsed) {
      out.appendChild(referenceCard(parsed));
      return;
    }

    out.appendChild(notice("Loading the index\u2026"));
    loadIndex(state.translation).then(function (index) {
      var book = state.book ? indexOfBook(state.book) : null;
      var result = STSearch.search(index, state.query, { bookIndex: book, limit: 4000 });
      var terms = result.terms;

      out.innerHTML = "";
      if (result.missing.length) {
        out.appendChild(notice("\u201c" + result.missing.join("\u201d, \u201c") +
          "\u201d " + (result.missing.length === 1 ? "does" : "do") + " not appear in the " +
          nameOf(state.translation) + " text.", true));
        return;
      }
      if (!result.ids.length) {
        out.appendChild(notice("No verse in the " + nameOf(state.translation) +
          (book == null ? "" : " (" + bookName(state.book) + ")") + " has all of " +
          terms.map(function (t) { return "\u201c" + t + "\u201d"; }).join(" and ") + "."));
        return;
      }
      state.ids = result.ids;
      state.terms = terms;
      state.shown = PAGE;
      drawPage(result.ids, terms, state.translation, state.book);
    }).catch(function () {
      out.innerHTML = "";
      out.appendChild(notice("Could not load the search index. Serve the folder over HTTP.", true));
    });
  }

  /* ---------- controls ---------- */

  function fillControls() {
    els.tr.innerHTML = "";
    (meta.translations || []).forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      els.tr.appendChild(o);
    });
    els.tr.value = state.translation;

    els.book.innerHTML = "";
    var all = document.createElement("option");
    all.value = "";
    all.textContent = "All books";
    els.book.appendChild(all);
    meta.books.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.slug;
      o.textContent = b.name;
      els.book.appendChild(o);
    });
    els.book.value = state.book;
  }

  function syncUrl() {
    var q = "?q=" + encodeURIComponent(state.query) + "&tr=" + encodeURIComponent(state.translation) +
      (state.book ? "&book=" + encodeURIComponent(state.book) : "");
    try { history.replaceState(null, "", q); } catch (e) { /* file:// */ }
  }

  function run() {
    state.shown = PAGE;
    syncUrl();
    render();
  }

  function init() {
    var wantedTr = ST.qs("tr");
    var wantedBook = ST.qs("book");
    var wantedQuery = ST.qs("q");

    ST.loadJSON(ST.siteRoot() + "data/search/index.json").then(function (data) {
      meta = data;
      if (wantedTr && (meta.translations || []).some(function (t) { return t.id === wantedTr; })) {
        state.translation = wantedTr;
      } else if (meta.translations && meta.translations.length) {
        state.translation = meta.translations[0].id;
      }
      if (wantedBook && indexOfBook(wantedBook) != null) { state.book = wantedBook; }
      fillControls();
      if (wantedQuery) {
        state.query = wantedQuery.trim();
        els.q.value = state.query;
      }
      render();
    }).catch(function () {
      els.out.innerHTML = "";
      els.out.appendChild(notice("Could not load the search index. Serve the folder over HTTP.", true));
    });

    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      state.query = els.q.value.trim();
      state.translation = els.tr.value;
      state.book = els.book.value;
      run();
    });
    els.tr.addEventListener("change", function () { state.translation = els.tr.value; run(); });
    els.book.addEventListener("change", function () { state.book = els.book.value; run(); });
  }

  init();
})();
