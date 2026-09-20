/* Home page for the Bible section: verse of the day, study tools, and the
   book grid that links into the pre-built World English Bible (Updated)
   chapter pages. Depends on js/common.js. */
(function () {
  "use strict";

  var VOTD = [
    ["john", 3, 16], ["psalms", 23, 1], ["romans", 8, 28], ["philippians", 4, 13],
    ["isaiah", 40, 31], ["proverbs", 3, 5], ["matthew", 11, 28], ["psalms", 119, 105],
    ["joshua", 1, 9], ["john", 14, 6], ["romans", 12, 2], ["galatians", 5, 22],
    ["ephesians", 2, 8], ["hebrews", 11, 1], ["james", 1, 5], ["i-peter", 5, 7],
    ["i-john", 1, 9], ["revelation-of-john", 21, 4], ["micah", 6, 8], ["psalms", 46, 1]
  ];

  function root() { return ST.siteRoot(); }

  /* Books open in the reader, so reading stays inside the site's own UI. */
  function bookHref(book) {
    return root() + "apps/bible/?book=" + encodeURIComponent(book.slug);
  }

  function bookCode(book) {
    var page = ST.versePageUrl({ book: book.slug, chapter: 1 });
    if (page) return page.replace(/[0-9]+\.html$/, "");
    var initials = book.name.replace(/[^A-Za-z ]/g, "").split(/\s+/)
      .map(function (w) { return w.charAt(0); }).join("");
    return initials.slice(0, 3).toUpperCase();
  }

  function initials(name) {
    return name.replace(/[^A-Za-z& ]/g, "").split(/\s+/)
      .filter(function (w) { return w && w.toLowerCase() !== "and"; })
      .map(function (w) { return w.charAt(0); }).join("").slice(0, 3).toUpperCase();
  }

  function dayOfYear() {
    var iso = ST.todayISO();
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) d = new Date();
    var start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  }

  function buildVerseOfDay() {
    var refEl = document.getElementById("votd-ref");
    var textEl = document.getElementById("votd-text");
    var linkEl = document.getElementById("votd-links");
    if (!refEl || !textEl) return;

    var pick = VOTD[dayOfYear() % VOTD.length];
    var slug = pick[0], chapter = pick[1], verse = pick[2];

    ST.loadTranslation(slug, "WEBU").then(function (data) {
      var text = (data.chapters[String(chapter)] || {})[String(verse)];
      var name = data.book || slug;
      var label = name + " " + chapter + ":" + verse;
      refEl.textContent = label;
      textEl.textContent = text || "Verse not available.";
      if (linkEl && text) {
        linkEl.setAttribute("href", root() + "apps/bible/?book=" + encodeURIComponent(slug) +
          "&chapter=" + chapter + "&verse=" + verse);
        linkEl.textContent = "Read the chapter \u2192";
      }
    }).catch(function () {
      textEl.textContent = "Could not load the verse of the day.";
    });
  }

  function buildToolGrid() {
    var host = document.getElementById("tools-grid");
    if (!host) return;
    host.innerHTML = "";
    ST.APPS.forEach(function (app) {
      host.appendChild(ST.el("a", { class: "app-book", href: root() + app.href }, [
        ST.el("span", { class: "abbrev", text: initials(app.name) }),
        ST.el("span", { class: "name", text: app.name })
      ]));
    });
  }

  function buildBookGrid(books) {
    var host = document.getElementById("book-grid");
    if (!host) return;

    var bySlug = {};
    books.forEach(function (b) { bySlug[b.slug] = b; });

    function render(group) {
      host.innerHTML = "";
      var def = null;
      ST.BOOK_GROUPS.forEach(function (g) { if (g.id === group) def = g; });
      var slugs = (def && def.deuterocanon)
        ? books.filter(function (b) { return b.deuterocanon; }).map(function (b) { return b.slug; })
        : (def ? def.slugs : []);
      var shown = 0;
      slugs.forEach(function (slug) {
        var b = bySlug[slug];
        if (!b) return;
        shown++;
        host.appendChild(ST.el("a", { class: "app-book", href: bookHref(b), title: b.name + " \u2014 " + b.chapters + " chapters" }, [
          ST.el("span", { class: "abbrev", text: bookCode(b) }),
          ST.el("span", { class: "name", text: b.name })
        ]));
      });
      if (!shown) {
        host.appendChild(ST.el("p", { class: "lemma-desc", text: "No books in this group." }));
      }
    }

    var tabs = document.querySelectorAll(".book-tabs .tab");
    if (tabs.length) {
      Array.prototype.forEach.call(tabs, function (tab) {
        tab.addEventListener("click", function () {
          Array.prototype.forEach.call(tabs, function (t) {
            t.setAttribute("aria-selected", t === tab ? "true" : "false");
          });
          render(tab.getAttribute("data-group"));
        });
      });
      var current = document.querySelector(".book-tabs .tab[aria-selected='true']");
      render(current ? current.getAttribute("data-group") : "law");
    } else {
      render("law");
    }
  }

  buildVerseOfDay();
  buildToolGrid();
  ST.loadBooks().then(buildBookGrid).catch(function () {
    var host = document.getElementById("book-grid");
    if (host) host.appendChild(ST.el("p", { class: "lemma-desc", text: "Could not load the book list. Serve the folder over HTTP." }));
  });
})();
