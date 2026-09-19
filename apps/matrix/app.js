(function () {
  "use strict";

  var LABELS = {
    KJV: { name: "King James Version", sub: "1769 · public domain" },
    KJVM: { name: "KJV, Modernized", sub: "American English · public domain" },
    ASV: { name: "American Standard Version", sub: "1901 · public domain" },
    WEB: { name: "World English Bible", sub: "public domain" },
    YLT: { name: "Young's Literal Translation", sub: "1862 · public domain" },
    KJVA: { name: "KJV with Apocrypha", sub: "1769 · public domain" },
    DRC: { name: "Douay-Rheims, Challoner", sub: "1752 · public domain" }
  };

  var CORE = ["KJV", "KJVM", "ASV", "WEB", "YLT"];
  var DEUTERO = ["KJVA", "DRC"];
  var STORAGE_KEY = "matrix-translations.v1";

  var els = {
    ref: document.getElementById("ref"),
    go: document.getElementById("go"),
    print: document.getElementById("print"),
    result: document.getElementById("result"),
    suggestions: document.getElementById("suggestions"),
    picker: document.getElementById("translation-picker"),
    deuterocanon: document.getElementById("deuterocanon-toggle")
  };

  var books = [];
  var bySlug = {};
  var stored = ST.store(STORAGE_KEY);
  var selected = (stored && stored.length) ? stored : CORE.slice();
  var userCustomized = !!(stored && stored.length);

  function isDeuterocanon(slug) {
    var book = bySlug[slug];
    return !!(book && book.deuterocanon);
  }

  function availableFor(slug) {
    var book = bySlug[slug];
    if (book && book.translations) return book.translations.slice();
    return CORE.slice();
  }

  function chosenFor(slug) {
    var available = availableFor(slug);
    var chosen = selected.filter(function (id) { return available.indexOf(id) !== -1; });
    // Until the reader picks translations themselves, show everything a
    // deuterocanonical book has, and the four core texts elsewhere.
    if (!userCustomized && isDeuterocanon(slug)) return available;
    if (!chosen.length) {
      chosen = available.filter(function (id) { return CORE.indexOf(id) !== -1; });
      if (!chosen.length) chosen = available.slice(0, 3);
    }
    return chosen;
  }

  function renderPicker() {
    if (!els.picker) return;
    els.picker.innerHTML = "";
    var all = CORE.concat(DEUTERO);
    all.forEach(function (id) {
      var label = LABELS[id] || { name: id };
      var input = ST.el("input", { type: "checkbox", id: "tr-" + id, value: id });
      input.checked = selected.indexOf(id) !== -1;
      input.addEventListener("change", function () {
        if (input.checked) {
          if (selected.indexOf(id) === -1) selected.push(id);
        } else {
          selected = selected.filter(function (x) { return x !== id; });
        }
        if (!selected.length) selected = ["KJV"];
        userCustomized = true;
        ST.store(STORAGE_KEY, selected);
        run();
      });
      var cb = ST.el("label", { class: "tr-choice", for: "tr-" + id }, [
        input,
        ST.el("span", { text: label.name })
      ]);
      els.picker.appendChild(cb);
    });
  }

  function showSuggestions(matches) {
    if (!matches.length) {
      els.suggestions.classList.add("hidden");
      els.suggestions.innerHTML = "";
      return;
    }
    els.suggestions.innerHTML = "";
    matches.slice(0, 8).forEach(function (b) {
      var btn = ST.el("button", { type: "button", text: b.name + (b.deuterocanon ? " (deuterocanon)" : "") });
      btn.addEventListener("click", function () {
        els.ref.value = b.name + " 1";
        els.suggestions.classList.add("hidden");
        run();
      });
      els.suggestions.appendChild(btn);
    });
    els.suggestions.classList.remove("hidden");
  }

  function bookMatches(text) {
    var q = text.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (!q) return [];
    return books.filter(function (b) {
      var name = b.name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      return name.indexOf(q) === 0 ||
        name.replace(/[ivx]+/g, "").indexOf(q) === 0 ||
        name.replace(/i{1,3} /, "").indexOf(q) === 0;
    });
  }

  function chapterButtons(slug, current, max) {
    var wrap = ST.el("div", { class: "chapter-picker no-print" });
    var quick = [1];
    if (current > 1) quick.push(current - 1, current);
    quick.push(current + 1);
    var top = [Math.ceil(max / 2), max - 1, max];
    var seen = {};
    quick.concat(top).forEach(function (n) {
      if (n < 1 || n > max || seen[n]) return;
      seen[n] = true;
      var b = ST.el("button", { type: "button", text: "Ch " + n });
      b.setAttribute("aria-pressed", n === current ? "true" : "false");
      b.addEventListener("click", function () {
        els.ref.value = displayBook(slug) + " " + n;
        run();
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function displayBook(slug) {
    return bySlug[slug] ? bySlug[slug].name : slug;
  }

  function render(parsed) {
    var verses = null;
    if (parsed.verseStart === null) {
      verses = { whole: true };
    } else {
      var list = [];
      for (var v = parsed.verseStart; v <= parsed.verseEnd; v++) list.push(v);
      verses = { whole: false, list: list };
    }

    els.result.innerHTML = "";
    var header = ST.el("div", { class: "card" }, [
      ST.el("div", { class: "row", style: "justify-content:space-between" }, [
        ST.el("div", {}, [
          ST.el("h2", { class: "serif", style: "margin:0 0 2px;font-size:1.35rem", text: displayBook(parsed.book) + " " + parsed.chapter }),
          ST.el("div", { class: "muted small", text: verses.whole ? "Whole chapter" : "Verses " + parsed.verseStart + (parsed.verseEnd !== parsed.verseStart ? "-" + parsed.verseEnd : "") })
        ]),
        ST.el("button", { class: "ghost no-print", id: "copy-matrix", text: "Copy as text",
          onclick: function () { copyMatrix(); } })
      ])
    ]);

    var grid = ST.el("div", { class: "matrix" });
    var rendered = [];
    var translations = chosenFor(parsed.book);

    if (isDeuterocanon(parsed.book)) {
      header.appendChild(ST.el("div", { class: "notice", style: "margin-top:10px",
        text: "This is a deuterocanonical book. Only translations that include it are shown." }));
    }

    var loads = translations.map(function (tr) {
      return ST.loadTranslation(parsed.book, tr).then(function (data) {
        return { tr: tr, data: data };
      }).catch(function () {
        return { tr: tr, error: true };
      });
    });

    Promise.all(loads).then(function (results) {
      var maxChapter = results.reduce(function (max, r) {
        return r.data ? Math.max(max, Object.keys(r.data.chapters).length) : max;
      }, 1);

      results.forEach(function (r) {
        var col = ST.el("div", { class: "card translation-col" });
        var info = LABELS[r.tr] || { name: r.tr, sub: "public domain" };
        col.appendChild(ST.el("h3", { text: info.name }));
        col.appendChild(ST.el("div", { class: "sub", text: info.sub }));

        if (r.error || !r.data) {
          col.appendChild(ST.el("p", { class: "missing", text: "Not available for this book." }));
          grid.appendChild(col);
          return;
        }

        var chapterData = r.data.chapters[String(parsed.chapter)];
        if (!chapterData) {
          col.appendChild(ST.el("p", { class: "missing", text: "Chapter not available in this translation." }));
          grid.appendChild(col);
          return;
        }

        var lines = [];
        if (verses.whole) {
          Object.keys(chapterData).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
            col.appendChild(ST.el("div", { class: "verse-row" }, [
              ST.el("span", { class: "num", text: v }),
              ST.el("p", { class: "verse", html: ST.escapeHTML(chapterData[String(v)]) })
            ]));
            lines.push(v + ". " + chapterData[String(v)]);
          });
        } else {
          verses.list.forEach(function (v) {
            var text = chapterData[String(v)];
            var row = ST.el("div", { class: "verse-row single" }, [ST.el("p", { class: "verse" })]);
            if (text == null || text === "") {
              row.firstChild.className = "verse missing";
              row.firstChild.textContent = "Verse " + v + " is not present in this translation's versification.";
            } else {
              row.firstChild.textContent = text;
              lines.push(v + ". " + text);
            }
            col.appendChild(row);
          });
        }

        if (verses.whole && maxChapter > 1) {
          col.appendChild(chapterButtons(parsed.book, parsed.chapter, maxChapter));
        }

        rendered.push({ tr: r.tr, name: info.name, text: lines.join("\n") });
        grid.appendChild(col);
      });

      window.__matrixText = rendered;
      els.result.appendChild(header);
      els.result.appendChild(grid);
      document.title = displayBook(parsed.book) + " " + parsed.chapter + " — Verse Matrix";
    });
  }

  function copyMatrix() {
    var parts = (window.__matrixText || []).map(function (m) {
      return m.name + " (" + m.tr + ")\n" + m.text;
    });
    ST.copyText(parts.join("\n\n")).then(function () { ST.toast("Matrix copied"); }, function () { ST.toast("Copy failed", true); });
  }

  function run() {
    var raw = els.ref.value.trim();
    if (!raw) return;
    var parsed = ST.parseRef(raw);
    if (!parsed || !bySlug[parsed.book]) {
      els.result.innerHTML = "";
      els.result.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: 'Could not understand that reference. Try a format like "John 3:16", "Psalm 23", or "Sirach 2:1-6".' })
      ]));
      return;
    }
    try { history.replaceState(null, "", "?ref=" + encodeURIComponent(raw)); } catch (e) { /* file:// */ }
    render(parsed);
  }

  function init() {
    ST.loadBooks().then(function (list) {
      books = list;
      bySlug = {};
      list.forEach(function (b) { bySlug[b.slug] = b; });
      renderPicker();

      var fromQuery = ST.qs("ref");
      els.ref.value = fromQuery || "John 3:16";
      run();
    }).catch(function () {
      els.result.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "Could not load the Bible index. If you opened this file directly, serve the folder over HTTP instead." })
      ]));
    });

    els.go.addEventListener("click", run);
    els.print.addEventListener("click", function () { window.print(); });

    els.ref.addEventListener("input", function () {
      showSuggestions(bookMatches(els.ref.value));
    });

    els.ref.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        els.suggestions.classList.add("hidden");
        run();
      }
    });

    document.addEventListener("click", function (e) {
      if (!els.suggestions.contains(e.target) && e.target !== els.ref) {
        els.suggestions.classList.add("hidden");
      }
    });

    document.querySelectorAll("[data-quick]").forEach(function (b) {
      b.addEventListener("click", function () {
        els.ref.value = b.getAttribute("data-quick");
        run();
      });
    });

    els.ref.addEventListener("blur", function () {
      setTimeout(function () { els.suggestions.classList.add("hidden"); }, 150);
    });
  }

  init();
})();
