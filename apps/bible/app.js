/* Bible reader: pick a book, a chapter, and one of the translations the site
   ships. Translations are grouped by canon so the full Bible (the texts that
   carry the Apocrypha) is an explicit option. Depends on js/common.js. */
(function () {
  "use strict";

  var STORE_KEY = "bible-translation.v1";

  var els = {
    book: document.getElementById("book"),
    chapter: document.getElementById("chapter"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    reader: document.getElementById("reader"),
    picker: document.getElementById("translation-picker")
  };

  var books = [];
  var bySlug = {};
  var translations = [];
  var state = { book: null, chapter: 1, tr: null, pendingVerse: null };

  function translationById(id) {
    for (var i = 0; i < translations.length; i++) {
      if (translations[i].id === id) return translations[i];
    }
    return null;
  }

  function availableFor(slug) {
    var b = bySlug[slug];
    if (b && b.translations && b.translations.length) return b.translations.slice();
    return translations.map(function (t) { return t.id; });
  }

  function inGroup(group) {
    if (group.deuterocanon) {
      return books.filter(function (b) { return b.deuterocanon; });
    }
    var out = [];
    group.slugs.forEach(function (slug) { if (bySlug[slug]) out.push(bySlug[slug]); });
    return out;
  }

  function flatBooks() {
    var out = [];
    ST.BOOK_GROUPS.forEach(function (g) {
      inGroup(g).forEach(function (b) { out.push(b); });
    });
    return out;
  }

  function indexOfSlug(order, slug) {
    for (var i = 0; i < order.length; i++) if (order[i].slug === slug) return i;
    return -1;
  }

  function notice(text, isError) {
    var el = document.createElement("div");
    el.className = "notice" + (isError ? " error" : "");
    el.textContent = text;
    return el;
  }

  function fillBooks() {
    els.book.innerHTML = "";
    ST.BOOK_GROUPS.forEach(function (group) {
      var list = inGroup(group);
      if (!list.length) return;
      var og = document.createElement("optgroup");
      og.label = group.label;
      list.forEach(function (b) {
        var o = document.createElement("option");
        o.value = b.slug;
        o.textContent = b.name;
        og.appendChild(o);
      });
      els.book.appendChild(og);
    });
  }

  function fillChapters(slug) {
    var b = bySlug[slug];
    var total = b ? b.chapters : 1;
    els.chapter.innerHTML = "";
    for (var i = 1; i <= total; i++) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = String(i);
      els.chapter.appendChild(o);
    }
  }

  function renderPicker() {
    if (!els.picker) return;
    els.picker.innerHTML = "";
    var avail = availableFor(state.book);
    ST.translationGroups(translations).forEach(function (group) {
      var wrap = document.createElement("div");

      var label = document.createElement("div");
      label.className = "tr-group-label";
      label.textContent = group.label;
      wrap.appendChild(label);

      var row = document.createElement("div");
      row.className = "tr-choices";
      group.translations.forEach(function (t) {
        var has = avail.indexOf(t.id) !== -1;

        var input = document.createElement("input");
        input.type = "radio";
        input.name = "bible-tr";
        input.id = "tr-" + t.id;
        input.value = t.id;
        input.checked = t.id === state.tr;
        input.disabled = !has;
        input.addEventListener("change", function () {
          state.tr = t.id;
          ST.store(STORE_KEY, state.tr);
          load();
        });

        var lab = document.createElement("label");
        lab.className = "tr-choice";
        lab.setAttribute("for", "tr-" + t.id);
        lab.appendChild(input);
        var span = document.createElement("span");
        span.textContent = has ? t.name : t.name + " \u2014 not in this book";
        lab.appendChild(span);

        row.appendChild(lab);
      });
      wrap.appendChild(row);
      els.picker.appendChild(wrap);
    });
  }

  function syncUrl() {
    var q = "?book=" + encodeURIComponent(state.book) + "&chapter=" + state.chapter +
            "&tr=" + encodeURIComponent(state.tr);
    try { history.replaceState(null, "", q); } catch (e) { /* file:// */ }
  }

  function scrollToVerse() {
    if (!state.pendingVerse) return;
    var target = document.getElementById("v" + state.pendingVerse);
    state.pendingVerse = null;
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "center" });
  }

  function renderChapter(book, t, data) {
    var chapterData = (data.chapters || {})[String(state.chapter)] || {};

    var card = document.createElement("section");
    card.className = "card";

    var head = document.createElement("div");
    head.className = "chapter-head";
    var h2 = document.createElement("h2");
    h2.textContent = book.name + " " + state.chapter;
    head.appendChild(h2);
    var meta = document.createElement("span");
    meta.className = "muted small";
    meta.textContent = t.name + " \u00b7 " + ST.translationSub(t);
    head.appendChild(meta);
    card.appendChild(head);

    if (book.deuterocanon) {
      card.appendChild(notice("This is a deuterocanonical book. Translations that do not carry the Apocrypha are unavailable here."));
    }

    var nums = Object.keys(chapterData)
      .map(Number)
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });

    if (!nums.length) {
      card.appendChild(notice("No text for this chapter in " + t.name + ".", true));
    } else {
      nums.forEach(function (n) {
        var row = document.createElement("div");
        row.className = "verse-block";
        row.id = "v" + n;
        var num = document.createElement("span");
        num.className = "num";
        num.textContent = String(n);
        var p = document.createElement("p");
        p.textContent = chapterData[String(n)];
        row.appendChild(num);
        row.appendChild(p);
        card.appendChild(row);
      });
    }

    els.reader.innerHTML = "";
    els.reader.appendChild(card);

    var nav = document.createElement("div");
    nav.className = "reader-nav no-print";
    var matrix = document.createElement("a");
    matrix.className = "btn secondary";
    matrix.href = ST.siteRoot() + "apps/matrix/?ref=" + encodeURIComponent(book.name + " " + state.chapter);
    matrix.textContent = "Compare translations \u2192";
    nav.appendChild(matrix);
    var print = document.createElement("button");
    print.type = "button";
    print.className = "ghost";
    print.textContent = "Print";
    print.addEventListener("click", function () { window.print(); });
    nav.appendChild(print);
    els.reader.appendChild(nav);

    document.title = book.name + " " + state.chapter + " \u2014 Read the Bible";
    syncUrl();
    scrollToVerse();
  }

  function load() {
    var book = bySlug[state.book];
    if (!book) return;
    var avail = availableFor(state.book);
    if (avail.indexOf(state.tr) === -1) state.tr = avail[0];
    var t = translationById(state.tr);
    if (!t) return;
    renderPicker();

    ST.loadTranslation(state.book, state.tr).then(function (data) {
      renderChapter(book, t, data);
    }).catch(function () {
      els.reader.innerHTML = "";
      els.reader.appendChild(notice("Could not load that chapter. If you opened this file directly, serve the folder over HTTP.", true));
    });
  }

  function updateNavButtons() {
    var order = flatBooks();
    var idx = indexOfSlug(order, state.book);
    var book = order[idx];
    els.prev.disabled = idx <= 0 && state.chapter <= 1;
    els.next.disabled = !!book && idx === order.length - 1 && state.chapter >= book.chapters;
  }

  function go(slug, chapter, verse) {
    if (!bySlug[slug]) return;
    state.book = slug;
    state.chapter = chapter || 1;
    state.pendingVerse = verse || null;
    els.book.value = slug;
    fillChapters(slug);
    els.chapter.value = String(state.chapter);
    updateNavButtons();
    load();
  }

  function step(delta) {
    var order = flatBooks();
    var idx = indexOfSlug(order, state.book);
    if (idx === -1) return;
    var book = order[idx];
    var ch = state.chapter + delta;
    if (ch < 1) {
      if (idx === 0) return;
      book = order[idx - 1];
      ch = book.chapters;
    } else if (ch > book.chapters) {
      if (idx === order.length - 1) return;
      book = order[idx + 1];
      ch = 1;
    }
    go(book.slug, ch);
  }

  function init() {
    var stored = ST.store(STORE_KEY);

    Promise.all([ST.loadBooks(), ST.loadTranslations()]).then(function (loaded) {
      books = loaded[0] || [];
      translations = loaded[1] || [];
      bySlug = {};
      books.forEach(function (b) { bySlug[b.slug] = b; });
      fillBooks();

      var start = { book: "john", chapter: 1, verse: null };
      var ref = ST.qs("ref");
      if (ref) {
        var parsed = ST.parseRef(ref);
        if (parsed && bySlug[parsed.book]) {
          start.book = parsed.book;
          start.chapter = parsed.chapter;
          start.verse = parsed.verseStart;
        }
      }
      var qb = ST.qs("book");
      if (qb && bySlug[qb]) {
        start.book = qb;
        start.chapter = parseInt(ST.qs("chapter"), 10) || 1;
        start.verse = parseInt(ST.qs("verse"), 10) || null;
      }

      var qtr = ST.qs("tr");
      if (qtr && translationById(qtr)) state.tr = qtr;
      else if (stored && translationById(stored)) state.tr = stored;
      if (!state.tr) state.tr = availableFor(start.book)[0] || (translations[0] && translations[0].id);

      go(start.book, start.chapter, start.verse);
    }).catch(function () {
      els.reader.appendChild(notice("Could not load the Bible index. Serve the folder over HTTP instead of opening the file directly.", true));
    });

    els.book.addEventListener("change", function () { go(els.book.value, 1); });
    els.chapter.addEventListener("change", function () { go(state.book, parseInt(els.chapter.value, 10) || 1); });
    els.prev.addEventListener("click", function () { step(-1); });
    els.next.addEventListener("click", function () { step(1); });
  }

  init();
})();
