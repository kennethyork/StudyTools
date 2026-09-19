(function () {
  "use strict";

  var els = {
    ref: document.getElementById("ref"),
    book: document.getElementById("book"),
    chapter: document.getElementById("chapter"),
    go: document.getElementById("go"),
    reader: document.getElementById("reader")
  };

  var index = null;
  var cache = {};

  function bookLabel(slug) {
    return (index.bookNames && index.bookNames[slug]) || slug;
  }

  function loadChapter(slug, chapter) {
    var key = slug + "." + chapter;
    if (cache[key]) return Promise.resolve(cache[key]);
    return ST.loadJSON(ST.siteRoot() + "data/interlinear/" + slug + "/" + chapter + ".json").then(function (data) {
      cache[key] = data;
      return data;
    });
  }

  function fillBooks() {
    els.book.innerHTML = "";
    Object.keys(index.books).forEach(function (slug) {
      els.book.appendChild(ST.el("option", { value: slug, text: bookLabel(slug) }));
    });
    els.book.value = "john";
    fillChapters();
  }

  function fillChapters() {
    var slug = els.book.value;
    var chapters = index.books[slug] || [];
    els.chapter.innerHTML = "";
    chapters.forEach(function (n) {
      els.chapter.appendChild(ST.el("option", { value: n, text: n }));
    });
    if (chapters.indexOf(3) !== -1) els.chapter.value = "3";
  }

  function morphemeHint(morph) {
    // Robinson/OpenGNT morphology: the part of speech is either spelled out
    // (CONJ, PREP, ADV, PRT, INJ, HEB) or a single letter.
    var map = {
      N: "noun", V: "verb", A: "adjective", T: "article", D: "demonstrative",
      P: "personal pronoun", R: "relative pronoun", X: "indefinite pronoun",
      F: "reflexive pronoun", S: "possessive pronoun", C: "reciprocal pronoun",
      I: "interrogative pronoun", K: "correlative pronoun",
      CONJ: "conjunction", PREP: "preposition", ADV: "adverb", PRT: "particle",
      INJ: "interjection", HEB: "Hebrew word", ARAM: "Aramaic word"
    };
    var head = String(morph || "").split(/[-\s]/)[0].toUpperCase();
    return map[head] || head.toLowerCase();
  }

  function render(data) {
    els.reader.innerHTML = "";
    var card = ST.el("div", { class: "card" });
    card.appendChild(ST.el("div", { class: "row", style: "justify-content:space-between;align-items:baseline" }, [
      ST.el("h2", { class: "serif", style: "margin:0;font-size:1.35rem", text: data.book + " " + data.chapter }),
      ST.el("a", { class: "ghost btn no-print", style: "font-size:.8rem", href: "../matrix/?ref=" + encodeURIComponent(data.book + " " + data.chapter), text: "Compare translations" })
    ]));

    var verses = Object.keys(data.verses).map(Number).sort(function (a, b) { return a - b; });
    verses.forEach(function (v) {
      var words = data.verses[String(v)];
      var block = ST.el("div", { class: "verse-block" });
      block.appendChild(ST.el("div", { class: "verse-num", text: "Verse " + v }));

      var greek = ST.el("p", { class: "verse-greek" });
      var literal = [];
      var cells = [];
      words.forEach(function (word, i) {
        var span = ST.el("span", { class: "w", "data-index": i }, [
          document.createTextNode(word.g + " ")
        ]);
        span.appendChild(ST.el("span", { class: "sup", text: word.s.replace(/^G/, "") }));
        greek.appendChild(span);
        if (word.e) literal.push(word.e);

        var cell = ST.el("div", { class: "word-cell", "data-index": i }, [
          ST.el("div", { class: "g", text: word.g }),
          ST.el("div", { class: "t", text: word.t }),
          ST.el("div", { class: "e", text: word.e || "—" }),
          ST.el("div", { class: "s", text: word.s + " · " + morphemeHint(word.m) })
        ]);
        cells.push(cell);
      });
      block.appendChild(greek);
      if (literal.length) {
        block.appendChild(ST.el("p", { class: "verse-literal", text: literal.join(" ") }));
      }
      var grid = ST.el("div", { class: "word-grid" });
      cells.forEach(function (c) { grid.appendChild(c); });
      block.appendChild(grid);

      // Highlight a word and its gloss in both views.
      function activate(index) {
        block.querySelectorAll(".w, .word-cell").forEach(function (n) {
          n.classList.toggle("active", n.getAttribute("data-index") === String(index));
        });
        var word = words[index];
        if (word) ST.toast(word.s + " · " + word.l + " · " + (word.e || ""), false);
      }
      grid.addEventListener("click", function (e) {
        var cell = e.target.closest(".word-cell");
        if (cell) activate(parseInt(cell.getAttribute("data-index"), 10));
      });
      greek.addEventListener("click", function (e) {
        var span = e.target.closest(".w");
        if (span) activate(parseInt(span.getAttribute("data-index"), 10));
      });

      card.appendChild(block);
    });

    els.reader.appendChild(card);
    document.title = data.book + " " + data.chapter + " — Greek Interlinear";
    try { history.replaceState(null, "", "?ref=" + encodeURIComponent(data.book + " " + data.chapter)); } catch (e) { /* file:// */ }
  }

  function show(slug, chapter) {
    els.book.value = slug;
    fillChapters();
    els.chapter.value = String(chapter);
    els.ref.value = bookLabel(slug) + " " + chapter;
    loadChapter(slug, chapter).then(render).catch(function () {
      els.reader.innerHTML = "";
      els.reader.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "No interlinear data for that chapter." })
      ]));
    });
  }

  function run(raw) {
    var text = (raw || els.ref.value || "").trim();
    if (!text) return;
    var parsed = ST.parseRef(text);
    if (parsed && index.books[parsed.book]) {
      show(parsed.book, Math.min(parsed.chapter, index.books[parsed.book].length ? Math.max.apply(null, index.books[parsed.book]) : parsed.chapter));
      return;
    }
    // Allow just a book name or "John 3".
    var m = text.match(/^\s*([1-3]?\s*[A-Za-z][A-Za-z. ]*?)(?:\s+(\d+))?\s*$/);
    if (m) {
      var slug = ST.normalizeBook(m[1]);
      if (slug && index.books[slug]) {
        show(slug, m[2] ? parseInt(m[2], 10) : 1);
        return;
      }
    }
    els.reader.innerHTML = "";
    els.reader.appendChild(ST.el("div", { class: "card" }, [
      ST.el("div", { class: "notice error", text: "Could not read that reference. Try \"John 3\" or \"Romans 8\"." })
    ]));
  }

  function init() {
    ST.loadJSON(ST.siteRoot() + "data/interlinear/index.json").then(function (data) {
      index = data;
      fillBooks();
      els.book.addEventListener("change", function () {
        fillChapters();
        show(els.book.value, parseInt(els.chapter.value, 10) || 1);
      });
      els.chapter.addEventListener("change", function () {
        show(els.book.value, parseInt(els.chapter.value, 10) || 1);
      });
      els.go.addEventListener("click", function () { run(); });
      els.ref.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });

      var fromQuery = ST.qs("ref");
      if (fromQuery) run(fromQuery); else show("john", 3);
    }).catch(function () {
      els.reader.innerHTML = "";
      els.reader.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "Could not load the interlinear data. Serve this folder over HTTP." })
      ]));
    });
  }

  init();
})();
