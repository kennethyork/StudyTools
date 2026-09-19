(function () {
  "use strict";

  var LABELS = {
    KJV: { name: "King James Version", sub: "1769 · public domain" },
    ASV: { name: "American Standard Version", sub: "1901 · public domain" },
    WEB: { name: "World English Bible", sub: "public domain" },
    YLT: { name: "Young's Literal Translation", sub: "1862 · public domain" }
  };

  var els = {
    ref: document.getElementById("ref"),
    go: document.getElementById("go"),
    print: document.getElementById("print"),
    result: document.getElementById("result"),
    suggestions: document.getElementById("suggestions")
  };

  var books = [];
  var lastQuery = "";

  function showSuggestions(matches) {
    if (!matches.length) {
      els.suggestions.classList.add("hidden");
      els.suggestions.innerHTML = "";
      return;
    }
    els.suggestions.innerHTML = "";
    matches.slice(0, 8).forEach(function (b) {
      var btn = ST.el("button", { type: "button", text: b.name });
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
      return name.indexOf(q) === 0 || name.replace(/[ivx]+/g, "").indexOf(q) === 0 ||
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
    for (var i = 0; i < books.length; i++) if (books[i].slug === slug) return books[i].name;
    return slug;
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
          ST.el("div", { class: "muted small", text: parsed.whole ? "Whole chapter" : "Verses " + parsed.verseStart + (parsed.verseEnd !== parsed.verseStart ? "-" + parsed.verseEnd : "") })
        ]),
        ST.el("button", { class: "ghost no-print", id: "copy-matrix", text: "Copy as text",
          onclick: function () { copyMatrix(); } })
      ])
    ]);

    var grid = ST.el("div", { class: "matrix" });
    var rendered = [];
    var loads = ST.TRANSLATIONS.map(function (tr) {
      return ST.loadTranslation(parsed.book, tr).then(function (data) {
        return { tr: tr, data: data };
      }).catch(function (err) {
        return { tr: tr, error: err };
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
          col.appendChild(ST.el("p", { class: "missing", text: "This translation could not be loaded." }));
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
          var nums = Object.keys(chapterData).map(Number).sort(function (a, b) { return a - b; });
          nums.forEach(function (v) {
            var row = ST.el("div", { class: "verse-row" }, [
              ST.el("span", { class: "num", text: v }),
              ST.el("p", { class: "verse", html: ST.escapeHTML(chapterData[String(v)]) })
            ]);
            col.appendChild(row);
            lines.push(v + ". " + chapterData[String(v)]);
          });
        } else {
          verses.list.forEach(function (v) {
            var text = chapterData[String(v)];
            var row = ST.el("div", { class: "verse-row single" }, [
              ST.el("p", { class: "verse" })
            ]);
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
    var parts = window.__matrixText.map(function (m) {
      return m.name + " (" + m.tr + ")\n" + m.text;
    });
    ST.copyText(parts.join("\n\n")).then(function () { ST.toast("Matrix copied"); }, function () { ST.toast("Copy failed", true); });
  }

  function run() {
    var raw = els.ref.value.trim();
    if (!raw) return;
    var parsed = ST.parseRef(raw);
    if (!parsed) {
      els.result.innerHTML = "";
      els.result.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: 'Could not understand that reference. Try a format like "John 3:16", "Psalm 23", or "1 Corinthians 13:4-7".' })
      ]));
      return;
    }
    lastQuery = raw;
    try { history.replaceState(null, "", "?ref=" + encodeURIComponent(raw)); } catch (e) { /* file:// */ }
    render(parsed);
  }

  function init() {
    ST.loadBooks().then(function (list) {
      books = list;
      var fromQuery = ST.qs("ref");
      if (fromQuery) {
        els.ref.value = fromQuery;
        run();
      } else {
        els.ref.value = "John 3:16";
        run();
      }
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
